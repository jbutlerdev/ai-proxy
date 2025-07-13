import OpenAI from 'openai';
import { ChatCompletionRequest, ChatCompletionResponse, StreamChunk } from '../types/openai';
import { Readable } from 'stream';
import type { ChatCompletionCreateParams } from 'openai/resources/chat/completions';

export class OpenAIClient {
  private client?: OpenAI;

  constructor(apiKey?: string) {
    if (apiKey || process.env.OPENAI_API_KEY) {
      this.client = new OpenAI({
        apiKey: apiKey || process.env.OPENAI_API_KEY,
      });
    }
  }

  async createChatCompletion(
    request: ChatCompletionRequest,
    apiKey?: string,
    baseURL?: string
  ): Promise<ChatCompletionResponse | Readable> {
    if (apiKey || baseURL) {
      this.client = new OpenAI({ 
        apiKey: apiKey || 'dummy', // OpenAI client requires an API key even if not used
        baseURL: baseURL,
      });
    }

    if (!this.client) {
      throw new Error('No OpenAI configuration provided.');
    }

    const startTime = Date.now();

    // Convert our request format to OpenAI's expected format
    const openAIRequest: ChatCompletionCreateParams = {
      model: request.model,
      messages: request.messages as any, // Cast to bypass type checking for now
      temperature: request.temperature,
      top_p: request.top_p,
      n: request.n,
      stream: request.stream,
      stop: request.stop,
      max_tokens: request.max_tokens,
      presence_penalty: request.presence_penalty,
      frequency_penalty: request.frequency_penalty,
      logit_bias: request.logit_bias,
      user: request.user,
      tools: request.tools as any,
      tool_choice: request.tool_choice as any,
    };

    if (request.stream) {
      const stream = await this.client.chat.completions.create({
        ...openAIRequest,
        stream: true,
      });

      // Convert the async iterator to a readable stream
      const readable = new Readable({
        async read() {
          try {
            const { value, done } = await stream[Symbol.asyncIterator]().next();
            if (done) {
              this.push(null);
            } else {
              // Handle reasoning content in streaming responses
              const processedChoices = value.choices.map((choice: any) => {
                if (choice.delta?.reasoning_content && !choice.delta.content) {
                  return {
                    ...choice,
                    delta: {
                      ...choice.delta,
                      content: choice.delta.reasoning_content,
                    }
                  };
                }
                return choice;
              });

              const chunk: StreamChunk = {
                id: value.id,
                object: 'chat.completion.chunk',
                created: value.created,
                model: value.model,
                system_fingerprint: value.system_fingerprint,
                choices: processedChoices as any,
              };
              this.push(`data: ${JSON.stringify(chunk)}\n\n`);
            }
          } catch (error) {
            this.destroy(error as Error);
          }
        },
      });

      return readable;
    } else {
      const response = await this.client.chat.completions.create({
        ...openAIRequest,
        stream: false,
      });

      const latency = Date.now() - startTime;

      // Handle reasoning content from models like qwen3
      const processedChoices = response.choices.map((choice: any) => {
        if (choice.message?.reasoning_content) {
          // Preserve both reasoning and content for proper display
          return {
            ...choice,
            message: {
              ...choice.message,
              // Keep reasoning_content for collapsible display
              reasoning_content: choice.message.reasoning_content,
              // If no content but we have reasoning, use reasoning as fallback
              content: choice.message.content || choice.message.reasoning_content,
            }
          };
        }
        return choice;
      });

      return {
        id: response.id,
        object: response.object,
        created: response.created,
        model: response.model,
        system_fingerprint: response.system_fingerprint,
        choices: processedChoices as any,
        usage: response.usage,
      } as ChatCompletionResponse;
    }
  }
}