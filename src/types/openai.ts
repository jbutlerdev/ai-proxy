export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  functions?: FunctionDefinition[];
  function_call?: 'none' | 'auto' | { name: string };
  tools?: ToolDefinition[];
  tool_choice?: 'none' | 'auto' | 'required' | { type: 'function'; function: { name: string } };
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  stop?: string | string[];
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  user?: string;
  response_format?: { type: 'text' | 'json_object' };
  seed?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
  content?: string | null | ContentPart[];
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

export interface FunctionDefinition {
  name: string;
  description?: string;
  parameters: Record<string, any>;
}

export interface ToolDefinition {
  type: 'function';
  function: FunctionDefinition;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion' | 'chat.completion.chunk';
  created: number;
  model: string;
  system_fingerprint?: string;
  choices: ChatCompletionChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_details?: {
      cached_tokens?: number;
      audio_tokens?: number;
    };
    completion_details?: {
      reasoning_tokens?: number;
      audio_tokens?: number;
      accepted_prediction_tokens?: number;
      rejected_prediction_tokens?: number;
    };
  };
}

export interface ChatCompletionChoice {
  index: number;
  message?: ChatMessage;
  delta?: Partial<ChatMessage>;
  logprobs?: any;
  finish_reason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call' | null;
}

export interface StreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  system_fingerprint?: string;
  choices: ChatCompletionChoice[];
}