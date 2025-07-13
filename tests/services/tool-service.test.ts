import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ToolService } from '../../src/services/tool-service';
import { db } from '../../src/db';
import { tools, apiKeys, apiKeyTools } from '../../src/db/schema';

// Mock the database
jest.mock('../../src/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

const mockDb = db as jest.Mocked<typeof db>;

describe('ToolService', () => {
  let toolService: ToolService;

  beforeEach(() => {
    toolService = new ToolService();
    jest.clearAllMocks();
  });

  describe('getToolsForApiKey', () => {
    it('should return tools for a given API key', async () => {
      const mockTools = [
        {
          id: 1,
          name: 'test-tool',
          description: 'A test tool',
          type: 'function' as const,
          parameters: { type: 'object' },
          implementation: 'return args;',
          mcpServerCommand: null,
          active: true,
        },
      ];

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(mockTools),
          }),
        }),
      } as any);

      const result = await toolService.getToolsForApiKey(1);

      expect(result).toEqual(mockTools);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should return empty array when no tools found', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      const result = await toolService.getToolsForApiKey(999);

      expect(result).toEqual([]);
    });
  });

  describe('convertToOpenAITools', () => {
    it('should convert proxy tools to OpenAI tool format', () => {
      const proxyTools = [
        {
          id: 1,
          name: 'calculator',
          description: 'Performs calculations',
          type: 'function' as const,
          parameters: {
            type: 'object',
            properties: {
              expression: { type: 'string' },
            },
            required: ['expression'],
          },
          implementation: 'return eval(args.expression);',
          mcpServerCommand: null,
          active: true,
        },
      ];

      const result = toolService.convertToOpenAITools(proxyTools);

      expect(result).toEqual([
        {
          type: 'function',
          function: {
            name: 'calculator',
            description: 'Performs calculations',
            parameters: {
              type: 'object',
              properties: {
                expression: { type: 'string' },
              },
              required: ['expression'],
            },
          },
        },
      ]);
    });
  });

  describe('executeTool', () => {
    it('should execute a custom function tool', async () => {
      const mockToolResult = [
        {
          tools: {
            id: 1,
            name: 'calculator',
            type: 'function',
            implementation: 'return { result: args.a + args.b };',
            mcpServerCommand: null,
          },
        },
      ];

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue(mockToolResult),
            }),
          }),
        }),
      } as any);

      const result = await toolService.executeTool('calculator', { a: 5, b: 3 }, 1);

      expect(result.success).toBe(true);
      expect(result.result).toEqual({ result: 8 });
    });

    it('should return error when tool not found', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as any);

      const result = await toolService.executeTool('nonexistent', {}, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Tool not found or not authorized');
    });

    it('should handle execution errors gracefully', async () => {
      const mockToolResult = [
        {
          tools: {
            id: 1,
            name: 'broken-tool',
            type: 'function',
            implementation: 'throw new Error(\"Something went wrong\");',
            mcpServerCommand: null,
          },
        },
      ];

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue(mockToolResult),
            }),
          }),
        }),
      } as any);

      const result = await toolService.executeTool('broken-tool', {}, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Something went wrong');
    });
  });

  describe('filterProxyTools', () => {
    it('should filter out proxy tool calls from response', () => {
      const response = {
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: '1',
                  function: { name: 'proxy-tool' },
                },
                {
                  id: '2',
                  function: { name: 'user-tool' },
                },
              ],
            },
          },
        ],
      };

      const result = toolService.filterProxyTools(response, ['proxy-tool']);

      expect(result.choices[0].message.tool_calls).toHaveLength(1);
      expect(result.choices[0].message.tool_calls[0].function.name).toBe('user-tool');
    });

    it('should remove tool_calls property when all tools are filtered', () => {
      const response = {
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: '1',
                  function: { name: 'proxy-tool' },
                },
              ],
            },
          },
        ],
      };

      const result = toolService.filterProxyTools(response, ['proxy-tool']);

      expect(result.choices[0].message.tool_calls).toBeUndefined();
    });

    it('should handle responses without tool calls', () => {
      const response = {
        choices: [
          {
            message: {
              content: 'Hello world',
            },
          },
        ],
      };

      const result = toolService.filterProxyTools(response, ['proxy-tool']);

      expect(result).toEqual(response);
    });
  });
});