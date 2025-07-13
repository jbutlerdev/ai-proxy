export * from './openai';

export interface ProxyTool {
  id: number;
  name: string;
  description: string;
  type: 'function' | 'mcp';
  parameters: Record<string, any>;
  implementation?: string;
  mcpServerCommand?: string;
  active: boolean;
}

export interface ApiKeyWithTools {
  id: number;
  key: string;
  name: string;
  active: boolean;
  tools: ProxyTool[];
}

export interface ConversationLog {
  id: string;
  apiKeyId: number;
  apiKeyName?: string;
  model: string;
  startedAt: Date;
  endedAt?: Date;
  totalTokensUsed: number;
  totalCost: number;
  messages: MessageLog[];
}

export interface MessageLog {
  id: string;
  conversationId: string;
  role: string;
  content?: string;
  toolCalls?: any;
  toolCallId?: string;
  name?: string;
  functionCall?: any;
  requestTokens: number;
  responseTokens: number;
  latencyMs?: number;
  createdAt: Date;
  toolExecutions?: ToolExecutionLog[];
}

export interface ToolExecutionLog {
  id: string;
  messageId: string;
  toolId: number;
  toolName?: string;
  input: any;
  output?: any;
  error?: string;
  executionTimeMs?: number;
  createdAt: Date;
}

export interface CreateApiKeyRequest {
  name: string;
}

export interface UpdateToolRequest {
  name?: string;
  description?: string;
  parameters?: Record<string, any>;
  implementation?: string;
  mcpServerCommand?: string;
  active?: boolean;
}

export interface CreateToolRequest {
  name: string;
  description: string;
  type: 'function' | 'mcp';
  parameters: Record<string, any>;
  implementation?: string;
  mcpServerCommand?: string;
}