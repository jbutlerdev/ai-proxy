import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ConversationLogger } from '../../src/services/conversation-logger';
import { db } from '../../src/db';

// Mock the database
jest.mock('../../src/db', () => ({
  db: {
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

const mockDb = db as jest.Mocked<typeof db>;

describe('ConversationLogger', () => {
  let logger: ConversationLogger;

  beforeEach(() => {
    logger = new ConversationLogger();
    jest.clearAllMocks();
  });

  describe('startConversation', () => {
    it('should create a new conversation and return ID', async () => {
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      } as any);

      const conversationId = await logger.startConversation(1, 'gpt-4');

      expect(conversationId).toBeDefined();
      expect(typeof conversationId).toBe('string');
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should include metadata when provided', async () => {
      const metadata = { userId: 123, sessionId: 'abc' };
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      } as any);

      await logger.startConversation(1, 'gpt-4', metadata);

      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('logRequest', () => {
    it('should log all messages in the request', async () => {
      const request = {
        model: 'gpt-4',
        messages: [
          { role: 'system' as const, content: 'You are a helpful assistant' },
          { role: 'user' as const, content: 'Hello' },
        ],
      };

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      } as any);

      await logger.logRequest('conv-123', request, 100);

      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });

    it('should handle messages with tool calls', async () => {
      const request = {
        model: 'gpt-4',
        messages: [
          {
            role: 'assistant' as const,
            content: null,
            tool_calls: [
              {
                id: 'call-123',
                type: 'function' as const,
                function: { name: 'calculator', arguments: '{\"a\": 5, \"b\": 3}' },
              },
            ],
          },
        ],
      };

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      } as any);

      await logger.logRequest('conv-123', request, 50);

      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('logResponse', () => {
    it('should log assistant response and update conversation totals', async () => {
      const response = {
        id: 'resp-123',
        object: 'chat.completion' as const,
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant' as const,
              content: 'Hello! How can I help you today?',
            },
            finish_reason: 'stop' as const,
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 25,
          total_tokens: 75,
        },
      };

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      } as any);

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      } as any);

      await logger.logResponse('conv-123', response, 25, 1500);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should handle responses without choices', async () => {
      const response = {
        id: 'resp-123',
        object: 'chat.completion' as const,
        created: Date.now(),
        model: 'gpt-4',
        choices: [],
      };

      await logger.logResponse('conv-123', response, 0, 1000);

      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  describe('endConversation', () => {
    it('should mark conversation as ended', async () => {
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      } as any);

      await logger.endConversation('conv-123');

      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('conversation key management', () => {
    it('should generate unique conversation keys', () => {
      const key1 = logger.getConversationKey(1);
      const key2 = logger.getConversationKey(1);

      expect(key1).toBeDefined();
      expect(key2).toBeDefined();
      expect(key1).not.toBe(key2);
    });

    it('should use provided request ID', () => {
      const key = logger.getConversationKey(1, 'custom-request-id');
      expect(key).toBe('custom-request-id');
    });

    it('should manage active conversations', () => {
      const key = 'test-key';
      const conversationId = 'conv-123';

      logger.setActiveConversation(key, conversationId);
      expect(logger.getActiveConversation(key)).toBe(conversationId);

      logger.clearActiveConversation(key);
      expect(logger.getActiveConversation(key)).toBeUndefined();
    });
  });
});