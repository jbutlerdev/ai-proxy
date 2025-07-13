import { db } from '../db';
import { tools, apiKeyTools, mcpServers } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { ProxyTool, ToolDefinition } from '../types';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { MCPService } from './mcp-service';

export class ToolService {
  private mcpService: MCPService;

  constructor() {
    this.mcpService = new MCPService();
  }

  async getToolsForApiKey(apiKeyId: number): Promise<ProxyTool[]> {
    const results = await db
      .select({
        id: tools.id,
        name: tools.name,
        description: tools.description,
        type: tools.type,
        sourceType: tools.sourceType,
        parameters: tools.parameters,
        implementation: tools.implementation,
        mcpServerCommand: tools.mcpServerCommand,
        mcpServerId: tools.mcpServerId,
        active: tools.active,
        mcpServerName: mcpServers.name,
        mcpServerCmd: mcpServers.command,
      })
      .from(tools)
      .innerJoin(apiKeyTools, eq(apiKeyTools.toolId, tools.id))
      .leftJoin(mcpServers, eq(mcpServers.id, tools.mcpServerId))
      .where(
        and(
          eq(apiKeyTools.apiKeyId, apiKeyId),
          eq(apiKeyTools.enabled, true),
          eq(tools.active, true)
        )
      );

    return results as ProxyTool[];
  }

  convertToOpenAITools(proxyTools: ProxyTool[]): ToolDefinition[] {
    return proxyTools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  async executeTool(
    toolName: string,
    args: any,
    apiKeyId: number
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    // Get tool details with MCP server info
    const toolResults = await db
      .select({
        tool: tools,
        mcpServer: mcpServers,
      })
      .from(tools)
      .innerJoin(apiKeyTools, eq(apiKeyTools.toolId, tools.id))
      .leftJoin(mcpServers, eq(mcpServers.id, tools.mcpServerId))
      .where(
        and(
          eq(tools.name, toolName),
          eq(apiKeyTools.apiKeyId, apiKeyId),
          eq(apiKeyTools.enabled, true),
          eq(tools.active, true)
        )
      )
      .limit(1);

    if (toolResults.length === 0) {
      return { success: false, error: 'Tool not found or not authorized' };
    }

    const { tool, mcpServer } = toolResults[0];

    try {
      if (tool.sourceType === 'builtin' && tool.implementation) {
        // Execute custom function
        const fn = new Function('args', tool.implementation);
        const result = await fn(args);
        return { success: true, result };
      } else if (tool.sourceType === 'mcp' && mcpServer) {
        // Execute MCP server tool
        return await this.mcpService.executeTool(mcpServer.command, toolName, args);
      } else if (tool.type === 'mcp' && tool.mcpServerCommand) {
        // Legacy support - execute MCP server using old method
        const result = await this.executeMCPServer(tool.mcpServerCommand, toolName, args);
        return { success: true, result };
      } else {
        return { success: false, error: 'Tool implementation not found' };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async executeMCPServer(
    command: string,
    toolName: string,
    args: any
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const [cmd, ...cmdArgs] = command.split(' ');
      const child = spawn(cmd, cmdArgs, {
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Send the tool execution request
      child.stdin.write(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: args,
          },
          id: uuidv4(),
        }) + '\n'
      );

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`MCP server exited with code ${code}: ${stderr}`));
        } else {
          try {
            const result = JSON.parse(stdout);
            resolve(result.result);
          } catch (error) {
            reject(new Error(`Failed to parse MCP server response: ${stdout}`));
          }
        }
      });

      child.on('error', (error) => {
        reject(error);
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        child.kill();
        reject(new Error('MCP server execution timeout'));
      }, 30000);
    });
  }

  filterProxyTools(response: any, proxyToolNames: string[]): any {
    if (!response.choices || response.choices.length === 0) {
      return response;
    }

    const filteredResponse = { ...response };
    filteredResponse.choices = response.choices.map((choice: any) => {
      if (choice.message?.tool_calls) {
        const filteredToolCalls = choice.message.tool_calls.filter(
          (toolCall: any) => !proxyToolNames.includes(toolCall.function.name)
        );

        return {
          ...choice,
          message: {
            ...choice.message,
            tool_calls: filteredToolCalls.length > 0 ? filteredToolCalls : undefined,
          },
        };
      }
      return choice;
    });

    return filteredResponse;
  }
}