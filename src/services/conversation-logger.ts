import { db } from '../db';
import { conversations, messages, toolExecutions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage, ChatCompletionRequest, ChatCompletionResponse, ContentPart } from '../types/openai';

export class ConversationLogger {
  private activeConversations: Map<string, string> = new Map();

  private serializeContent(content: string | null | ContentPart[] | undefined): string | null {
    if (content === null || content === undefined) return null;
    if (content === '') return ''; // Preserve empty string instead of converting to null
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

  async startConversation(
    apiKeyId: number,
    model: string,
    metadata?: any
  ): Promise<string> {
    const conversationId = uuidv4();
    
    await db.insert(conversations).values({
      id: conversationId,
      apiKeyId,
      model,
      metadata,
    });

    return conversationId;
  }

  async logRequest(
    conversationId: string,
    request: ChatCompletionRequest,
    requestTokens: number
  ): Promise<void> {
    // Log all messages in the request
    for (const message of request.messages) {
      await db.insert(messages).values({
        conversationId,
        role: message.role,
        content: this.serializeContent(message.content),
        toolCalls: message.tool_calls,
        toolCallId: message.tool_call_id,
        name: message.name,
        functionCall: message.function_call,
        requestTokens,
        responseTokens: 0,
      });
    }
  }

  async logResponse(
    conversationId: string,
    response: ChatCompletionResponse,
    responseTokens: number,
    latencyMs: number,
    reasoningTokens: number = 0,
    timeToFirstTokenMs?: number
  ): Promise<void> {
    if (!response.choices || response.choices.length === 0) {
      return;
    }

    // Log the assistant's response
    const assistantMessage = response.choices[0].message;
    if (assistantMessage) {
      // Prepare metadata with reasoning content if available
      const metadata: any = {};
      if ((assistantMessage as any).reasoning_content) {
        metadata.reasoning_content = (assistantMessage as any).reasoning_content;
      }

      await db.insert(messages).values({
        conversationId,
        role: assistantMessage.role,
        content: this.serializeContent(assistantMessage.content),
        toolCalls: assistantMessage.tool_calls,
        name: assistantMessage.name,
        functionCall: assistantMessage.function_call,
        requestTokens: 0,
        responseTokens,
        reasoningTokens,
        latencyMs,
        timeToFirstTokenMs,
        metadata: Object.keys(metadata).length > 0 ? metadata : null,
      });
    }

    // Update conversation totals
    if (response.usage) {
      await db
        .update(conversations)
        .set({
          totalTokensUsed: response.usage.total_tokens,
          totalCost: this.calculateCost(response.model, response.usage.total_tokens),
        })
        .where(eq(conversations.id, conversationId));
    }
  }

  async logToolExecution(
    messageId: string,
    toolId: number,
    input: any,
    output?: any,
    error?: string,
    executionTimeMs?: number
  ): Promise<void> {
    await db.insert(toolExecutions).values({
      messageId,
      toolId,
      input,
      output,
      error,
      executionTimeMs,
    });
  }

  async endConversation(conversationId: string): Promise<void> {
    await db
      .update(conversations)
      .set({ endedAt: new Date() })
      .where(eq(conversations.id, conversationId));
  }

  private calculateCost(model: string, totalTokens: number): number {
    // Simplified cost calculation - adjust based on actual OpenAI pricing
    const costPer1kTokens = {
      'gpt-4': 0.03,
      'gpt-4-turbo': 0.01,
      'gpt-3.5-turbo': 0.002,
      'gpt-3.5-turbo-16k': 0.003,
    };

    const rate = costPer1kTokens[model as keyof typeof costPer1kTokens] || 0.002;
    return Math.round((totalTokens / 1000) * rate * 100); // Return in cents
  }

  getConversationKey(apiKeyId: number, requestId?: string): string {
    return requestId || `${apiKeyId}-${Date.now()}`;
  }

  setActiveConversation(key: string, conversationId: string): void {
    this.activeConversations.set(key, conversationId);
  }

  getActiveConversation(key: string): string | undefined {
    return this.activeConversations.get(key);
  }

  clearActiveConversation(key: string): void {
    this.activeConversations.delete(key);
  }
}