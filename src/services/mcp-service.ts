import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { mcpServers, tools } from '../db/schema';
import { eq } from 'drizzle-orm';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

export interface MCPServer {
  id: number;
  name: string;
  command: string;
  description: string | null;
  allowedDirectories: string[] | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class MCPService {
  /**
   * Discover tools available from an MCP server
   */
  async discoverTools(command: string): Promise<MCPTool[]> {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(' ');
      const child = spawn(cmd, args, {
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

      // Send tools/list request
      const request = {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: uuidv4(),
      };

      child.stdin.write(JSON.stringify(request) + '\n');
      child.stdin.end();

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`MCP server exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          // Parse the response - might have multiple lines
          const lines = stdout.trim().split('\n');
          let response = null;
          
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.jsonrpc && parsed.result) {
                response = parsed;
                break;
              }
            } catch (e) {
              // Skip non-JSON lines (like server startup messages)
              continue;
            }
          }

          if (!response || !response.result || !response.result.tools) {
            reject(new Error(`Invalid response from MCP server: ${stdout}`));
            return;
          }

          const mcpTools: MCPTool[] = response.result.tools.map((tool: any) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          }));

          resolve(mcpTools);
        } catch (error) {
          reject(new Error(`Failed to parse MCP server response: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        child.kill();
        reject(new Error('MCP server discovery timeout'));
      }, 10000);
    });
  }

  /**
   * Execute a tool on an MCP server
   */
  async executeTool(
    command: string,
    toolName: string,
    args: any
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    return new Promise((resolve) => {
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
      const request = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
        },
        id: uuidv4(),
      };

      child.stdin.write(JSON.stringify(request) + '\n');
      child.stdin.end();

      child.on('close', (code) => {
        if (code !== 0) {
          resolve({ success: false, error: `MCP server exited with code ${code}: ${stderr}` });
          return;
        }

        try {
          // Parse the response - might have multiple lines
          const lines = stdout.trim().split('\n');
          let response = null;
          
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.jsonrpc && (parsed.result !== undefined || parsed.error !== undefined)) {
                response = parsed;
                break;
              }
            } catch (e) {
              // Skip non-JSON lines
              continue;
            }
          }

          if (!response) {
            resolve({ success: false, error: `No valid response from MCP server: ${stdout}` });
            return;
          }

          if (response.error) {
            resolve({ success: false, error: response.error.message || 'MCP server error' });
            return;
          }

          resolve({ success: true, result: response.result });
        } catch (error) {
          resolve({ success: false, error: `Failed to parse MCP server response: ${stdout}` });
        }
      });

      child.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        child.kill();
        resolve({ success: false, error: 'MCP tool execution timeout' });
      }, 30000);
    });
  }

  /**
   * Sync tools from an MCP server to the database
   */
  async syncServerTools(serverId: number): Promise<void> {
    // Get server details
    const [server] = await db
      .select()
      .from(mcpServers)
      .where(eq(mcpServers.id, serverId))
      .limit(1);

    if (!server) {
      throw new Error('MCP server not found');
    }

    // Discover tools from the server
    const mcpTools = await this.discoverTools(server.command);

    // Remove existing tools for this server
    await db
      .delete(tools)
      .where(eq(tools.mcpServerId, serverId));

    // Insert new tools
    const toolsToInsert = mcpTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      type: 'mcp' as const,
      sourceType: 'mcp' as const,
      parameters: tool.inputSchema,
      mcpServerId: serverId,
      active: true,
    }));

    if (toolsToInsert.length > 0) {
      await db.insert(tools).values(toolsToInsert);
    }
  }

  /**
   * Get all MCP servers
   */
  async getServers(): Promise<MCPServer[]> {
    return await db.select().from(mcpServers);
  }

  /**
   * Create a new MCP server
   */
  async createServer(serverData: {
    name: string;
    command: string;
    description?: string;
    allowedDirectories?: string[];
  }): Promise<MCPServer> {
    const [newServer] = await db
      .insert(mcpServers)
      .values(serverData)
      .returning();

    return newServer;
  }

  /**
   * Update an MCP server
   */
  async updateServer(
    id: number,
    updates: Partial<{
      name: string;
      command: string;
      description: string;
      allowedDirectories: string[];
      active: boolean;
    }>
  ): Promise<void> {
    await db
      .update(mcpServers)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(mcpServers.id, id));
  }

  /**
   * Delete an MCP server and its tools
   */
  async deleteServer(id: number): Promise<void> {
    // Delete associated tools first
    await db.delete(tools).where(eq(tools.mcpServerId, id));
    
    // Delete the server
    await db.delete(mcpServers).where(eq(mcpServers.id, id));
  }
}