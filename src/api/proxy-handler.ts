import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { OpenAIClient } from '../services/openai-client';
import { ToolService } from '../services/tool-service';
import { ConversationLogger } from '../services/conversation-logger';
import { ChatCompletionRequest, ChatCompletionResponse, ChatMessage, ToolCall, ContentPart } from '../types/openai';
import { Readable } from 'stream';
import { db } from '../db';
import { upstreamModels, upstreamServers, messages } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';

export class ProxyHandler {
  private openAIClient: OpenAIClient;
  private toolService: ToolService;
  private conversationLogger: ConversationLogger;

  constructor() {
    this.openAIClient = new OpenAIClient();
    this.toolService = new ToolService();
    this.conversationLogger = new ConversationLogger();
  }

  private serializeContent(content: string | null | ContentPart[] | undefined): string | null {
    if (!content) return null;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      // Convert array of content parts to string representation
      return content.map(part => {
        if (part.type === 'text') return part.text || '';
        if (part.type === 'image_url') return `[IMAGE: ${part.image_url?.url || 'URL not available'}]`;
        return '';
      }).join('');
    }
    return null;
  }

  async handleChatCompletion(req: AuthenticatedRequest, res: Response) {
    // API key authentication is required - req.apiKey will always be set

    const request = req.body as ChatCompletionRequest;
    
    try {
      // Get the upstream server for this model
      const upstreamConfig = await this.getUpstreamForModel(request.model);
      if (!upstreamConfig) {
        return res.status(400).json({ error: `Model ${request.model} not found or not enabled` });
      }

      // Get tools for this API key  
      const proxyTools = await this.toolService.getToolsForApiKey(req.apiKey!.id);
      const proxyToolNames = proxyTools.map(t => t.name);

      // Inject proxy tools into the request
      const modifiedRequest = { ...request };
      if (proxyTools.length > 0) {
        const openAITools = this.toolService.convertToOpenAITools(proxyTools);
        modifiedRequest.tools = [...(request.tools || []), ...openAITools];
      }

      // Start conversation logging
      const conversationId = await this.conversationLogger.startConversation(
        req.apiKey!.id,
        request.model
      );

      // Log the request
      const requestTokens = this.estimateTokens(request.messages);
      await this.conversationLogger.logRequest(conversationId, request, requestTokens);

      // Handle streaming vs non-streaming
      if (request.stream) {
        await this.handleStreamingResponse(
          modifiedRequest,
          upstreamConfig,
          proxyToolNames,
          conversationId,
          req,
          res
        );
      } else {
        await this.handleNonStreamingResponse(
          modifiedRequest,
          upstreamConfig,
          proxyToolNames,
          conversationId,
          req,
          res
        );
      }
    } catch (error) {
      console.error('Proxy error:', error);
      res.status(500).json({ error: 'Internal proxy error' });
    }
  }

  private async handleNonStreamingResponse(
    request: ChatCompletionRequest,
    upstreamConfig: any,
    proxyToolNames: string[],
    conversationId: string,
    req: AuthenticatedRequest,
    res: Response
  ) {
    const startTime = Date.now();
    let response = await this.openAIClient.createChatCompletion(
      request,
      upstreamConfig.apiKey,
      upstreamConfig.baseUrl
    ) as ChatCompletionResponse;

    // Handle tool calls
    console.log('Initial response has tool calls:', !!response.choices?.[0]?.message?.tool_calls);
    response = await this.handleToolCalls(
      response,
      request,
      proxyToolNames,
      req.apiKey!.id,
      upstreamConfig,
      conversationId
    );
    console.log('After handleToolCalls, response has tool calls:', !!response.choices?.[0]?.message?.tool_calls);

    // Filter out proxy tools from the response
    const filteredResponse = this.toolService.filterProxyTools(response, proxyToolNames);
    console.log('After filtering, response has tool calls:', !!filteredResponse.choices?.[0]?.message?.tool_calls);

    // Log the response
    const latencyMs = Date.now() - startTime;
    const responseTokens = response.usage?.completion_tokens || 0;
    const reasoningTokens = response.usage?.completion_details?.reasoning_tokens || 0;
    await this.conversationLogger.logResponse(
      conversationId,
      response,
      responseTokens,
      latencyMs,
      reasoningTokens
    );

    // End conversation
    await this.conversationLogger.endConversation(conversationId);

    res.json(filteredResponse);
  }

  private async handleStreamingResponse(
    request: ChatCompletionRequest,
    upstreamConfig: any,
    proxyToolNames: string[],
    conversationId: string,
    req: AuthenticatedRequest,
    res: Response
  ) {
    // If no proxy tools, just pass through the stream unchanged
    if (proxyToolNames.length === 0) {
      return this.handleStreamingPassthrough(request, upstreamConfig, conversationId, res);
    }

    // Buffer the entire response to check for tool calls
    const response = await this.openAIClient.createChatCompletion(
      { ...request, stream: false }, // Force non-streaming to get complete response
      upstreamConfig.apiKey,
      upstreamConfig.baseUrl
    ) as ChatCompletionResponse;

    // Check if the response contains any proxy tool calls
    const hasProxyToolCalls = response.choices?.[0]?.message?.tool_calls?.some(tc => 
      proxyToolNames.includes(tc.function.name)
    );

    // If no proxy tool calls, just pass through the response as stream
    if (!hasProxyToolCalls) {
      console.log('No proxy tool calls in response, passing through as stream');
      await this.replayResponseAsStream(response, res);
      
      // Log the response that was streamed
      const responseTokens = response.usage?.completion_tokens || 0;
      const reasoningTokens = response.usage?.completion_details?.reasoning_tokens || 0;
      await this.conversationLogger.logResponse(
        conversationId,
        response,
        responseTokens,
        0,
        reasoningTokens
      );
      
      await this.conversationLogger.endConversation(conversationId);
      return;
    }

    // Handle tool calls if present
    console.log('Streaming: Initial response has tool calls:', !!response.choices?.[0]?.message?.tool_calls);
    const finalResponse = await this.handleToolCalls(
      response,
      request,
      proxyToolNames,
      req.apiKey!.id,
      upstreamConfig,
      conversationId
    );
    console.log('Streaming: After handleToolCalls, response has tool calls:', !!finalResponse.choices?.[0]?.message?.tool_calls);
    console.log('Streaming: Final response content:', typeof finalResponse.choices?.[0]?.message?.content === 'string' 
      ? finalResponse.choices?.[0]?.message?.content?.substring(0, 100)
      : 'Content is not a string');

    // Now stream the final response
    await this.replayResponseAsStream(finalResponse, res);

    // Log the response
    const responseTokens = finalResponse.usage?.completion_tokens || 0;
    const reasoningTokens = finalResponse.usage?.completion_details?.reasoning_tokens || 0;
    await this.conversationLogger.logResponse(
      conversationId,
      finalResponse,
      responseTokens,
      0,
      reasoningTokens
    );

    await this.conversationLogger.endConversation(conversationId);
  }

  private async handleStreamingPassthrough(
    request: ChatCompletionRequest,
    upstreamConfig: any,
    conversationId: string,
    res: Response
  ) {
    const startTime = Date.now();
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await this.openAIClient.createChatCompletion(
      request,
      upstreamConfig.apiKey,
      upstreamConfig.baseUrl
    ) as Readable;

    let buffer = '';
    let totalTokens = 0;
    let accumulatedContent = '';
    let accumulatedReasoningContent = '';
    let streamId = '';
    let streamModel = '';
    let finishReason = '';
    let timeToFirstToken: number | undefined;
    let accumulatedToolCalls: any[] = [];

    stream.on('data', (chunk: Buffer) => {
      const data = chunk.toString();
      buffer += data;

      // Parse complete SSE messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.substring(6);
          if (jsonStr === '[DONE]') {
            res.write('data: [DONE]\n\n');
            continue;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            
            // Capture stream metadata
            if (parsed.id) streamId = parsed.id;
            if (parsed.model) streamModel = parsed.model;
            
            // Pass through unchanged since no proxy tools
            res.write(`data: ${JSON.stringify(parsed)}\n\n`);
            
            // Accumulate content for logging
            if (parsed.choices?.[0]?.delta?.content) {
              accumulatedContent += parsed.choices[0].delta.content;
              totalTokens += parsed.choices[0].delta.content.split(' ').length;
              
              // Track time to first token
              if (timeToFirstToken === undefined) {
                timeToFirstToken = Date.now() - startTime;
              }
            }
            if (parsed.choices?.[0]?.delta?.reasoning_content) {
              accumulatedReasoningContent += parsed.choices[0].delta.reasoning_content;
            }
            
            // Handle tool calls in streaming
            if (parsed.choices?.[0]?.delta?.tool_calls) {
              const deltaToolCalls = parsed.choices[0].delta.tool_calls;
              for (const toolCall of deltaToolCalls) {
                if (toolCall.index !== undefined) {
                  // Initialize or update tool call at index
                  if (!accumulatedToolCalls[toolCall.index]) {
                    accumulatedToolCalls[toolCall.index] = {
                      id: toolCall.id || '',
                      type: 'function',
                      function: {
                        name: toolCall.function?.name || '',
                        arguments: ''
                      }
                    };
                  }
                  
                  // Update tool call data
                  if (toolCall.id) {
                    accumulatedToolCalls[toolCall.index].id = toolCall.id;
                  }
                  if (toolCall.function?.name) {
                    accumulatedToolCalls[toolCall.index].function.name = toolCall.function.name;
                  }
                  if (toolCall.function?.arguments) {
                    accumulatedToolCalls[toolCall.index].function.arguments += toolCall.function.arguments;
                  }
                }
              }
            }
            
            if (parsed.choices?.[0]?.finish_reason) {
              finishReason = parsed.choices[0].finish_reason;
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    });

    stream.on('end', async () => {
      // Log the accumulated streaming response
      // Always log response even if content is empty string
      const streamingResponse = {
          id: streamId,
          object: 'chat.completion' as const,
          created: Math.floor(Date.now() / 1000),
          model: streamModel,
          choices: [{
            index: 0,
            message: {
              role: 'assistant' as const,
              content: accumulatedContent || null,
              reasoning_content: accumulatedReasoningContent || undefined,
              tool_calls: accumulatedToolCalls.length > 0 ? accumulatedToolCalls : undefined
            },
            finish_reason: finishReason as 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call' | null
          }],
          usage: {
            completion_tokens: totalTokens,
            prompt_tokens: 0, // We don't have this from streaming
            total_tokens: totalTokens
          }
        };

      await this.conversationLogger.logResponse(
        conversationId,
        streamingResponse,
        totalTokens,
        0, // No latency calculation for streaming
        0, // No reasoning tokens from streaming estimation
        timeToFirstToken
      );

      await this.conversationLogger.endConversation(conversationId);
      res.end();
    });

    stream.on('error', (error) => {
      console.error('Stream error:', error);
      res.end();
    });
  }

  private async replayResponseAsStream(response: ChatCompletionResponse, res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Simulate streaming by breaking the response into chunks
    const message = response.choices?.[0]?.message;
    
    if (!message || !response.choices || response.choices.length === 0) {
      // No message in response, send error
      console.log('No message in response or empty choices array');
      res.write(`data: ${JSON.stringify({error: "No message in response"})}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    
    // Always send initial chunk with role
    const roleChunk = {
      id: response.id,
      object: 'chat.completion.chunk',
      created: response.created,
      model: response.model,
      choices: [{
        index: 0,
        delta: { role: message.role },
        finish_reason: null
      }]
    };
    res.write(`data: ${JSON.stringify(roleChunk)}\n\n`);

    // Send content if present
    if (message.content) {
      const content = message.content;
      const chunkSize = 1; // Send character by character for smooth streaming
      for (let i = 0; i < content.length; i += chunkSize) {
        const chunk = content.slice(i, i + chunkSize);
        const contentChunk = {
          id: response.id,
          object: 'chat.completion.chunk',
          created: response.created,
          model: response.model,
          choices: [{
            index: 0,
            delta: { content: chunk },
            finish_reason: null
          }]
        };
        res.write(`data: ${JSON.stringify(contentChunk)}\n\n`);
        
        // Small delay to simulate real streaming
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }

    // Send tool calls if present
    if (message?.tool_calls && message.tool_calls.length > 0) {
      for (let i = 0; i < message.tool_calls.length; i++) {
        const toolCall = message.tool_calls[i];
        
        // Send tool call start with ID and function name
        const toolCallStartChunk = {
          id: response.id,
          object: 'chat.completion.chunk',
          created: response.created,
          model: response.model,
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: i,
                id: toolCall.id,
                type: 'function',
                function: {
                  name: toolCall.function.name,
                  arguments: ''
                }
              }]
            },
            finish_reason: null
          }]
        };
        res.write(`data: ${JSON.stringify(toolCallStartChunk)}\n\n`);
        
        // Stream the arguments in chunks
        const args = toolCall.function.arguments;
        const argChunkSize = 10;
        for (let j = 0; j < args.length; j += argChunkSize) {
          const argChunk = args.slice(j, j + argChunkSize);
          const toolCallArgChunk = {
            id: response.id,
            object: 'chat.completion.chunk',
            created: response.created,
            model: response.model,
            choices: [{
              index: 0,
              delta: {
                tool_calls: [{
                  index: i,
                  function: {
                    arguments: argChunk
                  }
                }]
              },
              finish_reason: null
            }]
          };
          res.write(`data: ${JSON.stringify(toolCallArgChunk)}\n\n`);
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }
    }

    // Send final chunk with finish_reason
    const finishChunk = {
      id: response.id,
      object: 'chat.completion.chunk',
      created: response.created,
      model: response.model,
      choices: [{
        index: 0,
        delta: {},
        finish_reason: response.choices[0]?.finish_reason || 'stop'
      }]
    };
    res.write(`data: ${JSON.stringify(finishChunk)}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }

  private async handleToolCalls(
    response: ChatCompletionResponse,
    request: ChatCompletionRequest,
    proxyToolNames: string[],
    apiKeyId: number,
    upstreamConfig: any,
    conversationId?: string
  ): Promise<ChatCompletionResponse> {
    if (!response.choices?.[0]?.message?.tool_calls) {
      return response;
    }

    const toolCalls = response.choices[0].message.tool_calls;
    console.log('All tool calls:', toolCalls.map(tc => tc.function.name));
    console.log('Proxy tool names:', proxyToolNames);
    const proxyToolCalls = toolCalls.filter(tc => 
      proxyToolNames.includes(tc.function.name)
    );
    console.log('Proxy tool calls found:', proxyToolCalls.length);

    if (proxyToolCalls.length === 0) {
      console.log('No proxy tool calls found, returning original response');
      return response;
    }

    // Log the assistant's message with tool calls if we have a conversation ID
    if (conversationId) {
      const metadata: any = {};
      if ((response.choices[0].message as any).reasoning_content) {
        metadata.reasoning_content = (response.choices[0].message as any).reasoning_content;
      }

      await this.conversationLogger.logResponse(
        conversationId,
        response,
        response.usage?.completion_tokens || 0,
        0
      );
    }

    // Execute proxy tools
    const toolResults: ChatMessage[] = [];
    for (const toolCall of proxyToolCalls) {
      const args = JSON.parse(toolCall.function.arguments);
      const result = await this.toolService.executeTool(
        toolCall.function.name,
        args,
        apiKeyId
      );

      const toolResult: ChatMessage = {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result.success ? result.result : { error: result.error }),
      };

      toolResults.push(toolResult);

      // Log the tool result if we have a conversation ID
      if (conversationId) {
        await db.insert(messages).values({
          conversationId,
          role: 'tool',
          content: this.serializeContent(toolResult.content),
          toolCallId: toolCall.id,
          name: toolCall.function.name,
          requestTokens: 0,
          responseTokens: 0,
        });
      }
    }

    // Continue the conversation with tool results
    const continuationRequest: ChatCompletionRequest = {
      ...request,
      stream: false, // Force non-streaming for tool continuation
      messages: [
        ...request.messages,
        response.choices[0].message!,
        ...toolResults,
      ],
    };

    console.log('Making continuation request with', continuationRequest.messages.length, 'messages');
    console.log('Last message roles:', continuationRequest.messages.slice(-3).map(m => m.role));
    console.log('Full continuation request:', JSON.stringify(continuationRequest, null, 2));

    let continuationResponse: ChatCompletionResponse;
    try {
      continuationResponse = await this.openAIClient.createChatCompletion(
        continuationRequest,
        upstreamConfig.apiKey,
        upstreamConfig.baseUrl
      ) as ChatCompletionResponse;
    } catch (error) {
      console.error('Error in continuation request:', error);
      throw error;
    }

    console.log('Continuation response:', {
      hasContent: !!continuationResponse.choices?.[0]?.message?.content,
      contentLength: continuationResponse.choices?.[0]?.message?.content?.length,
      hasToolCalls: !!continuationResponse.choices?.[0]?.message?.tool_calls,
      finishReason: continuationResponse.choices?.[0]?.finish_reason
    });
    console.log('Full continuation response:', JSON.stringify(continuationResponse, null, 2));

    return this.handleToolCalls(
      continuationResponse,
      continuationRequest,
      proxyToolNames,
      apiKeyId,
      upstreamConfig,
      conversationId
    );
  }

  private estimateTokens(messages: ChatMessage[]): number {
    // Simplified token estimation
    let tokens = 0;
    for (const message of messages) {
      if (message.content) {
        if (typeof message.content === 'string') {
          tokens += message.content.split(' ').length * 1.3;
        } else if (Array.isArray(message.content)) {
          // Handle multi-modal content (array of text/image parts)
          for (const part of message.content) {
            if (part.type === 'text' && part.text) {
              tokens += part.text.split(' ').length * 1.3;
            } else if (part.type === 'image_url') {
              // Rough estimate for image tokens
              tokens += 85; // OpenAI's estimate for low-detail images
            }
          }
        }
      }
    }
    return Math.round(tokens);
  }

  async handleModels(req: AuthenticatedRequest, res: Response) {
    // API is open - no authorization required

    try {
      // Get enabled models from database
      const models = await db
        .select({
          id: upstreamModels.modelId,
          object: sql`'model'`.as('object'),
          created: sql`EXTRACT(EPOCH FROM ${upstreamModels.createdAt})::int`.as('created'),
          owned_by: upstreamServers.name,
          permission: sql`'[]'::json`.as('permission'),
          root: upstreamModels.modelId,
          parent: sql`null`.as('parent'),
        })
        .from(upstreamModels)
        .innerJoin(upstreamServers, eq(upstreamServers.id, upstreamModels.upstreamServerId))
        .where(
          and(
            eq(upstreamModels.enabled, true),
            eq(upstreamServers.active, true)
          )
        )
        .orderBy(upstreamModels.displayName);

      res.json({
        object: 'list',
        data: models.map(model => ({
          id: model.id,
          object: model.object,
          created: model.created,
          owned_by: model.owned_by.toLowerCase().replace(' ', '-'),
          permission: [],
          root: model.root,
          parent: model.parent,
        })),
      });
    } catch (error) {
      console.error('Error fetching models:', error);
      res.status(500).json({ error: 'Failed to fetch models' });
    }
  }

  async handleCompletions(req: AuthenticatedRequest, res: Response) {
    // API is open - no authorization required

    try {
      // Get the target upstream server for the model
      const { model } = req.body;
      const upstreamModel = await this.getUpstreamForModel(model);
      
      if (!upstreamModel) {
        return res.status(400).json({ error: `Model ${model} not found or not enabled` });
      }

      // Forward to upstream
      const response = await this.forwardToUpstream(
        upstreamModel.baseUrl,
        upstreamModel.apiKey,
        '/v1/completions',
        'POST',
        req.body
      );

      res.json(response);
    } catch (error) {
      console.error('Error handling completions:', error);
      res.status(500).json({ error: 'Failed to process completion request' });
    }
  }

  async handleEmbeddings(req: AuthenticatedRequest, res: Response) {
    // API is open - no authorization required

    try {
      // Get the target upstream server for the model
      const { model } = req.body;
      const upstreamModel = await this.getUpstreamForModel(model);
      
      if (!upstreamModel) {
        return res.status(400).json({ error: `Model ${model} not found or not enabled` });
      }

      // Forward to upstream
      const response = await this.forwardToUpstream(
        upstreamModel.baseUrl,
        upstreamModel.apiKey,
        '/v1/embeddings',
        'POST',
        req.body
      );

      res.json(response);
    } catch (error) {
      console.error('Error handling embeddings:', error);
      res.status(500).json({ error: 'Failed to process embeddings request' });
    }
  }

  private async getUpstreamForModel(modelId: string) {
    const result = await db
      .select({
        baseUrl: upstreamServers.baseUrl,
        apiKey: upstreamServers.apiKey,
        headers: upstreamServers.headers,
      })
      .from(upstreamModels)
      .innerJoin(upstreamServers, eq(upstreamServers.id, upstreamModels.upstreamServerId))
      .where(
        and(
          eq(upstreamModels.modelId, modelId),
          eq(upstreamModels.enabled, true),
          eq(upstreamServers.active, true)
        )
      )
      .limit(1);

    return result[0] || null;
  }

  private async forwardToUpstream(
    baseUrl: string,
    apiKey: string | null,
    endpoint: string,
    method: string,
    body: any
  ) {
    const url = `${baseUrl.replace(/\/$/, '')}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Upstream error: ${response.status} ${error}`);
    }

    return response.json();
  }
}