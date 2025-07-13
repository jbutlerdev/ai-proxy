import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { OpenAIClient } from '../services/openai-client';
import { ToolService } from '../services/tool-service';
import { ConversationLogger } from '../services/conversation-logger';
import { ChatCompletionRequest, ChatCompletionResponse, ChatMessage, ToolCall } from '../types/openai';
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

  async handleChatCompletion(req: AuthenticatedRequest, res: Response) {
    // API is open - req.apiKey will always be set (anonymous if no auth header)

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
    response = await this.handleToolCalls(
      response,
      request,
      proxyToolNames,
      req.apiKey!.id,
      upstreamConfig,
      conversationId
    );

    // Filter out proxy tools from the response
    const filteredResponse = this.toolService.filterProxyTools(response, proxyToolNames);

    // Log the response
    const latencyMs = Date.now() - startTime;
    const responseTokens = response.usage?.completion_tokens || 0;
    await this.conversationLogger.logResponse(
      conversationId,
      response,
      responseTokens,
      latencyMs
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
            // Filter proxy tools from streamed chunks
            const filtered = this.toolService.filterProxyTools(parsed, proxyToolNames);
            res.write(`data: ${JSON.stringify(filtered)}\n\n`);
            
            // Count tokens (simplified)
            if (parsed.choices?.[0]?.delta?.content) {
              totalTokens += parsed.choices[0].delta.content.split(' ').length;
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    });

    stream.on('end', async () => {
      await this.conversationLogger.endConversation(conversationId);
      res.end();
    });

    stream.on('error', (error) => {
      console.error('Stream error:', error);
      res.end();
    });
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
    const proxyToolCalls = toolCalls.filter(tc => 
      proxyToolNames.includes(tc.function.name)
    );

    if (proxyToolCalls.length === 0) {
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
          content: toolResult.content,
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
      messages: [
        ...request.messages,
        response.choices[0].message!,
        ...toolResults,
      ],
    };

    return this.handleToolCalls(
      await this.openAIClient.createChatCompletion(
        continuationRequest,
        upstreamConfig.apiKey,
        upstreamConfig.baseUrl
      ) as ChatCompletionResponse,
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
        tokens += message.content.split(' ').length * 1.3;
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