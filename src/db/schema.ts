import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  uuid,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const apiKeys = pgTable('api_keys', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  keyIdx: uniqueIndex('key_idx').on(table.key),
}));

export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  apiKeyId: integer('api_key_id').references(() => apiKeys.id).notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  endedAt: timestamp('ended_at'),
  totalTokensUsed: integer('total_tokens_used').default(0).notNull(),
  totalCost: integer('total_cost').default(0).notNull(), // in cents
  metadata: jsonb('metadata'),
}, (table) => ({
  apiKeyIdx: index('conversations_api_key_idx').on(table.apiKeyId),
  startedAtIdx: index('conversations_started_at_idx').on(table.startedAt),
}));

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').references(() => conversations.id).notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  content: text('content'),
  toolCalls: jsonb('tool_calls'),
  toolCallId: varchar('tool_call_id', { length: 255 }),
  name: varchar('name', { length: 255 }),
  functionCall: jsonb('function_call'),
  requestTokens: integer('request_tokens').default(0).notNull(),
  responseTokens: integer('response_tokens').default(0).notNull(),
  reasoningTokens: integer('reasoning_tokens').default(0).notNull(),
  latencyMs: integer('latency_ms'),
  timeToFirstTokenMs: integer('time_to_first_token_ms'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  metadata: jsonb('metadata'),
}, (table) => ({
  conversationIdx: index('messages_conversation_idx').on(table.conversationId),
  createdAtIdx: index('messages_created_at_idx').on(table.createdAt),
}));

export const mcpServers = pgTable('mcp_servers', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  command: text('command').notNull(),
  description: text('description'),
  allowedDirectories: text('allowed_directories').array(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  nameIdx: uniqueIndex('mcp_servers_name_idx').on(table.name),
  activeIdx: index('mcp_servers_active_idx').on(table.active),
}));

export const tools = pgTable('tools', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description').notNull(),
  type: varchar('type', { length: 50 }).notNull(), // 'function' or 'mcp'
  sourceType: varchar('source_type', { length: 50 }).default('builtin').notNull(), // 'builtin' or 'mcp'
  parameters: jsonb('parameters').notNull(),
  implementation: text('implementation'), // For custom tools
  mcpServerCommand: text('mcp_server_command'), // Legacy - for backward compatibility
  mcpServerId: integer('mcp_server_id').references(() => mcpServers.id),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  nameIdx: index('tools_name_idx').on(table.name),
  typeIdx: index('tools_type_idx').on(table.type),
  mcpServerIdx: index('tools_mcp_server_idx').on(table.mcpServerId),
  sourceTypeIdx: index('tools_source_type_idx').on(table.sourceType),
  // uniqueNameSourceIdx: uniqueIndex('tools_unique_name_source_idx').on(table.name, sql`COALESCE(${table.mcpServerId}, -1)`),
}));

export const apiKeyTools = pgTable('api_key_tools', {
  id: serial('id').primaryKey(),
  apiKeyId: integer('api_key_id').references(() => apiKeys.id).notNull(),
  toolId: integer('tool_id').references(() => tools.id).notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  apiKeyToolIdx: uniqueIndex('api_key_tool_idx').on(table.apiKeyId, table.toolId),
}));

export const toolExecutions = pgTable('tool_executions', {
  id: uuid('id').defaultRandom().primaryKey(),
  messageId: uuid('message_id').references(() => messages.id).notNull(),
  toolId: integer('tool_id').references(() => tools.id).notNull(),
  input: jsonb('input').notNull(),
  output: jsonb('output'),
  error: text('error'),
  executionTimeMs: integer('execution_time_ms'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  messageIdx: index('tool_executions_message_idx').on(table.messageId),
  toolIdx: index('tool_executions_tool_idx').on(table.toolId),
}));

export const upstreamServers = pgTable('upstream_servers', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  baseUrl: varchar('base_url', { length: 500 }).notNull(),
  apiKey: text('api_key'), // Optional - for servers that require auth
  active: boolean('active').default(true).notNull(),
  description: text('description'),
  headers: jsonb('headers'), // Additional headers for requests
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  nameIdx: uniqueIndex('upstream_servers_name_idx').on(table.name),
}));

export const upstreamModels = pgTable('upstream_models', {
  id: serial('id').primaryKey(),
  upstreamServerId: integer('upstream_server_id').references(() => upstreamServers.id).notNull(),
  modelId: varchar('model_id', { length: 255 }).notNull(), // The actual model ID from upstream
  displayName: varchar('display_name', { length: 255 }).notNull(), // Display name in our system
  enabled: boolean('enabled').default(false).notNull(), // Whether this model is available to proxy clients
  capabilities: jsonb('capabilities'), // What the model supports (chat, completion, etc.)
  pricing: jsonb('pricing'), // Pricing information if available
  lastSynced: timestamp('last_synced').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  upstreamServerIdx: index('upstream_models_server_idx').on(table.upstreamServerId),
  modelIdIdx: index('upstream_models_model_id_idx').on(table.modelId),
  enabledIdx: index('upstream_models_enabled_idx').on(table.enabled),
  // Unique constraint to prevent same model name from multiple servers
  uniqueEnabledModelIdx: uniqueIndex('unique_enabled_model_idx').on(table.displayName).where(sql`enabled = true`),
}));

// Relations
export const apiKeysRelations = relations(apiKeys, ({ many }) => ({
  conversations: many(conversations),
  apiKeyTools: many(apiKeyTools),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  apiKey: one(apiKeys, {
    fields: [conversations.apiKeyId],
    references: [apiKeys.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  toolExecutions: many(toolExecutions),
}));

export const mcpServersRelations = relations(mcpServers, ({ many }) => ({
  tools: many(tools),
}));

export const toolsRelations = relations(tools, ({ one, many }) => ({
  apiKeyTools: many(apiKeyTools),
  toolExecutions: many(toolExecutions),
  mcpServer: one(mcpServers, {
    fields: [tools.mcpServerId],
    references: [mcpServers.id],
  }),
}));

export const apiKeyToolsRelations = relations(apiKeyTools, ({ one }) => ({
  apiKey: one(apiKeys, {
    fields: [apiKeyTools.apiKeyId],
    references: [apiKeys.id],
  }),
  tool: one(tools, {
    fields: [apiKeyTools.toolId],
    references: [tools.id],
  }),
}));

export const toolExecutionsRelations = relations(toolExecutions, ({ one }) => ({
  message: one(messages, {
    fields: [toolExecutions.messageId],
    references: [messages.id],
  }),
  tool: one(tools, {
    fields: [toolExecutions.toolId],
    references: [tools.id],
  }),
}));

export const upstreamServersRelations = relations(upstreamServers, ({ many }) => ({
  models: many(upstreamModels),
}));

export const upstreamModelsRelations = relations(upstreamModels, ({ one }) => ({
  upstreamServer: one(upstreamServers, {
    fields: [upstreamModels.upstreamServerId],
    references: [upstreamServers.id],
  }),
}));