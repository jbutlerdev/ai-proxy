import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolRequest, ListToolsRequest, Tool } from '@modelcontextprotocol/sdk/types.js';
import { db } from '../db';
import { mcpServers, tools, apiKeyTools } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';

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
  environmentVariables: Record<string, string> | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MCPAuthenticationResult {
  needsAuth: boolean;
  authUrl?: string;
  message?: string;
}

export class MCPService {
  // Cache for authentication check results
  private authCheckCache = new Map<string, { result: MCPAuthenticationResult; timestamp: number }>();
  private readonly AUTH_CACHE_TTL = 30000; // 30 seconds cache TTL

  /**
   * Check if an MCP server needs authentication and generate auth URL if needed
   */
  async checkAuthentication(command: string, environmentVariables?: Record<string, string>, hostHeader?: string): Promise<MCPAuthenticationResult> {
    // Create cache key
    const cacheKey = `${command}:${JSON.stringify(environmentVariables)}`;
    
    // Check cache first
    const cached = this.authCheckCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.AUTH_CACHE_TTL) {
      console.log('Auth check: Using cached result');
      return cached.result;
    }
    
    let client: Client | null = null;
    
    try {
      client = await this.createMCPClient(command, environmentVariables);
      const result = await client.listTools();
      
      if (result.isError) {
        console.log('MCP server error during auth check:', result.error);
        const authResult = { needsAuth: false };
        this.authCheckCache.set(cacheKey, { result: authResult, timestamp: Date.now() });
        return authResult;
      }
      
      // Check if there are any auth-related tools
      const authTools = this.findAuthTools(result);
      
      if (authTools.length > 0) {
        console.log(`Found auth tools: ${authTools.join(', ')}`);
        
        // If we have auth tools, try to test if authentication is actually working
        // by attempting to execute a simple operation
        try {
          const tools = await this.discoverTools(command, environmentVariables);
          
          // If we can discover tools, try to test with a simple tool execution
          if (tools.length > 0) {
            // Try to execute a simple tool to test if credentials are valid
            const simpleTools = tools.filter(tool => 
              tool.name.includes('list') || 
              tool.name.includes('get') || 
              tool.name.includes('calendars') ||
              tool.name.includes('events')
            );
            
            if (simpleTools.length > 0) {
              console.log(`Testing auth with tool: ${simpleTools[0].name}`);
              const testResult = await this.executeTool(
                command, 
                simpleTools[0].name, 
                this.getTestArgumentsForTool(simpleTools[0].name, environmentVariables),
                environmentVariables
              );
              
              // If the tool execution succeeds, auth is working
              if (testResult.success) {
                console.log('Auth check: tool execution successful, authentication working');
                const authResult = { needsAuth: false };
                this.authCheckCache.set(cacheKey, { result: authResult, timestamp: Date.now() });
                return authResult;
              }
              
              // If it fails with auth-related errors, need authentication
              if (testResult.error && this.isAuthenticationError(testResult.error)) {
                console.log('Auth check: authentication error detected, requiring auth');
                const authResult = {
                  needsAuth: true,
                  message: 'Authentication required for this MCP server'
                };
                this.authCheckCache.set(cacheKey, { result: authResult, timestamp: Date.now() });
                return authResult;
              }
            }
          }
        } catch (error) {
          console.log('Auth check: tool execution test failed:', error);
        }
        
        // If we have auth tools but couldn't determine status, assume auth is needed
        const authResult = {
          needsAuth: true,
          message: 'Authentication required for this MCP server'
        };
        this.authCheckCache.set(cacheKey, { result: authResult, timestamp: Date.now() });
        return authResult;
      }
      
      // No auth tools found, assume no auth needed
      const authResult = { needsAuth: false };
      this.authCheckCache.set(cacheKey, { result: authResult, timestamp: Date.now() });
      return authResult;
      
    } catch (error) {
      console.log('Error checking authentication:', error);
      const authResult = { needsAuth: false };
      this.authCheckCache.set(cacheKey, { result: authResult, timestamp: Date.now() });
      return authResult;
    } finally {
      if (client) {
        await client.close();
      }
    }
  }

  /**
   * Get test arguments for a tool based on its name
   */
  private getTestArgumentsForTool(toolName: string, environmentVariables?: Record<string, string>): any {
    const userEmail = environmentVariables?.GOOGLE_OAUTH_USER_EMAIL || 'test@example.com';
    
    // Google Workspace tools
    if (toolName.includes('calendar') || toolName.includes('events')) {
      return { user_google_email: userEmail };
    }
    if (toolName.includes('gmail') || toolName.includes('mail')) {
      return { user_google_email: userEmail };
    }
    if (toolName.includes('drive') || toolName.includes('file')) {
      return { user_google_email: userEmail };
    }
    if (toolName.includes('list')) {
      return { user_google_email: userEmail };
    }
    
    // Generic fallback
    return { user: userEmail };
  }

  /**
   * Check if an error message indicates authentication issues
   */
  private isAuthenticationError(error: string): boolean {
    const authErrorPatterns = [
      'credentials',
      'authentication',
      'unauthorized',
      'auth',
      'login',
      'token',
      'permission',
      'access denied',
      'invalid_grant',
      'oauth'
    ];
    
    const lowercaseError = error.toLowerCase();
    return authErrorPatterns.some(pattern => lowercaseError.includes(pattern));
  }

  /**
   * Find authentication-related tools in the MCP server's tool list
   */
  private findAuthTools(result: any): string[] {
    const authToolNames = [
      'start_google_auth',
      'start_oauth',
      'authenticate',
      'login',
      'auth',
      'authorize'
    ];
    
    let toolsArray: any[] = [];
    
    // Use same logic as discoverTools to extract tools from result
    if (result.result && typeof result.result === 'object' && Array.isArray((result.result as any).tools)) {
      toolsArray = (result.result as any).tools;
    } else if (result.result && Array.isArray(result.result)) {
      toolsArray = result.result;
    } else if (Array.isArray((result as any).tools)) {
      toolsArray = (result as any).tools;
    } else if (Array.isArray(result)) {
      toolsArray = result;
    }
    
    return toolsArray
      .filter(tool => tool.name && authToolNames.some(authName => 
        tool.name.toLowerCase().includes(authName.toLowerCase())
      ))
      .map(tool => tool.name);
  }

  /**
   * Create and connect to an MCP client
   */
  private async createMCPClient(command: string, environmentVariables?: Record<string, string>): Promise<Client> {
    const [cmd, ...args] = command.split(' ');
    
    // Create transport
    const mergedEnv = { 
      ...process.env, 
      ...(environmentVariables || {})
    } as Record<string, string>;
    
    // Debug: Log environment variables for Google Workspace MCP
    if (command.includes('workspace-mcp')) {
      console.log('=== MCP Environment Variables Debug ===');
      console.log('GOOGLE_OAUTH_CLIENT_ID:', mergedEnv.GOOGLE_OAUTH_CLIENT_ID ? 'SET' : 'NOT SET');
      console.log('GOOGLE_OAUTH_CLIENT_SECRET:', mergedEnv.GOOGLE_OAUTH_CLIENT_SECRET ? 'SET' : 'NOT SET');
      console.log('GOOGLE_OAUTH_AUTHENTICATED:', mergedEnv.GOOGLE_OAUTH_AUTHENTICATED);
      console.log('GOOGLE_MCP_CREDENTIALS_DIR:', mergedEnv.GOOGLE_MCP_CREDENTIALS_DIR);
      console.log('GOOGLE_OAUTH_USER_EMAIL:', mergedEnv.GOOGLE_OAUTH_USER_EMAIL);
      console.log('WORKSPACE_MCP_PORT:', mergedEnv.WORKSPACE_MCP_PORT);
      console.log('PORT:', mergedEnv.PORT);
      console.log('=========================================');
    }
    
    const transport = new StdioClientTransport({
      command: cmd,
      args: args,
      env: mergedEnv
    });

    // Create client
    const client = new Client({
      name: 'proxy-server',
      version: '1.0.0'
    }, {
      capabilities: {
        sampling: {}
      }
    });

    // Connect with timeout
    const connectPromise = client.connect(transport);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('MCP client connection timeout')), 10000);
    });

    await Promise.race([connectPromise, timeoutPromise]);
    
    return client;
  }

  /**
   * Get auth URL from MCP server (for servers that support auth tools)
   */
  async getAuthUrl(command: string, environmentVariables?: Record<string, string>): Promise<string> {
    let client: Client | null = null;
    
    try {
      client = await this.createMCPClient(command, environmentVariables);
      
      // First, discover available auth tools
      const toolsResult = await client.listTools();
      if (toolsResult.isError) {
        throw new Error('Failed to list tools from MCP server');
      }
      
      const authTools = this.findAuthTools(toolsResult);
      if (authTools.length === 0) {
        throw new Error('No authentication tools found in MCP server');
      }
      
      // Try to call the first available auth tool
      const authToolName = authTools[0];
      console.log(`Calling auth tool: ${authToolName}`);
      
      // Prepare arguments based on the tool name
      let args: any = {};
      if (authToolName.includes('google')) {
        args = {
          user_google_email: environmentVariables?.GOOGLE_OAUTH_USER_EMAIL || 'user@example.com',
          service_name: 'Google Drive'
        };
      } else {
        // For other auth tools, use generic arguments
        args = {
          service: 'default',
          user: 'user@example.com'
        };
      }
      
      const result = await client.callTool({
        name: authToolName,
        arguments: args
      });

      if (result.isError) {
        throw new Error(result.error && typeof result.error === 'object' && 'message' in result.error 
          ? String(result.error.message) 
          : 'Unknown error');
      }

      // Extract auth URL from result
      console.log('=== Auth Result Debug ===');
      console.log('result.result:', result.result);
      console.log('result.result type:', typeof result.result);
      console.log('Full result:', JSON.stringify(result, null, 2));
      console.log('========================');
      
      // The MCP SDK returns the result directly in the response, not nested under result.result
      if (typeof result.result === 'string') {
        return result.result;
      }

      // Handle structured MCP response with content array - check both result.result and result directly
      let contentToCheck: any = result.result;
      if (!contentToCheck && 'content' in result) {
        contentToCheck = result;
      }
      
      if (contentToCheck && typeof contentToCheck === 'object' && 'content' in contentToCheck && Array.isArray(contentToCheck.content)) {
        const content = contentToCheck.content;
        if (content.length > 0 && content[0].type === 'text' && content[0].text) {
          const text = content[0].text;
          console.log('Checking text for auth URL:', text.substring(0, 200) + '...');
          // Extract authorization URL from the text using more generic patterns
          const urlPatterns = [
            /Authorization URL: (https:\/\/[^\s\n]+)/,
            /Auth URL: (https:\/\/[^\s\n]+)/,
            /Visit: (https:\/\/[^\s\n]+)/,
            /Go to: (https:\/\/[^\s\n]+)/,
            /(https:\/\/[^\s\n]*oauth[^\s\n]*)/i,
            /(https:\/\/[^\s\n]*auth[^\s\n]*)/i
          ];
          
          for (const pattern of urlPatterns) {
            const urlMatch = text.match(pattern);
            if (urlMatch && urlMatch[1]) {
              console.log('Extracted auth URL:', urlMatch[1]);
              return urlMatch[1];
            }
          }
        }
      }
      
      // Check if the response has content directly at the top level
      if (result && 'content' in result && Array.isArray(result.content)) {
        const content = result.content;
        if (content.length > 0 && content[0].type === 'text' && content[0].text) {
          const text = content[0].text;
          console.log('Checking top-level text for auth URL:', text.substring(0, 200) + '...');
          // Extract authorization URL from the text using more generic patterns
          const urlPatterns = [
            /Authorization URL: (https:\/\/[^\s\n]+)/,
            /Auth URL: (https:\/\/[^\s\n]+)/,
            /Visit: (https:\/\/[^\s\n]+)/,
            /Go to: (https:\/\/[^\s\n]+)/,
            /(https:\/\/[^\s\n]*oauth[^\s\n]*)/i,
            /(https:\/\/[^\s\n]*auth[^\s\n]*)/i
          ];
          
          for (const pattern of urlPatterns) {
            const urlMatch = text.match(pattern);
            if (urlMatch && urlMatch[1]) {
              console.log('Extracted auth URL from top-level:', urlMatch[1]);
              return urlMatch[1];
            }
          }
        }
      }

      throw new Error('Could not extract auth URL from MCP server response');
    } finally {
      if (client) {
        await client.close();
      }
    }
  }

  /**
   * Discover tools available from an MCP server
   */
  async discoverTools(command: string, environmentVariables?: Record<string, string>): Promise<MCPTool[]> {
    let client: Client | null = null;
    
    try {
      client = await this.createMCPClient(command, environmentVariables);
      
      // List tools
      const result = await client.listTools();
      console.log('ListTools result:', JSON.stringify(result, null, 2));
      
      if (result.isError) {
        console.error('MCP server error response:', result.error);
        const error = result.error as any;
        if (error && error.code === -32602) {
          // For Google Workspace MCP server, this might mean authentication is needed
          console.log('Authentication may be required - this is expected for Google Workspace MCP server');
          if (command.includes('workspace-mcp')) {
            console.log('Google Workspace MCP server environment variables:', JSON.stringify(environmentVariables, null, 2));
          }
        }
        
        // Check if this is a Google Workspace MCP server that needs authentication
        if (command.includes('workspace-mcp')) {
          console.log('Google Workspace MCP server may need authentication completion - returning empty tools list');
          return [];
        }
        
        throw new Error(`MCP server error: ${error && error.message ? String(error.message) : 'Unknown error'}`);
      }

      // Convert MCP tools to our format
      // Debug the actual structure returned by the SDK
      console.log('=== SDK Result Debug ===');
      console.log('result keys:', Object.keys(result));
      console.log('result.result:', result.result);
      console.log('result.result type:', typeof result.result);
      console.log('result.result keys:', result.result ? Object.keys(result.result) : 'N/A');
      console.log('Full result structure:', JSON.stringify(result, null, 2));
      
      // Try different access patterns based on the MCP SDK documentation
      let toolsArray: any[] = [];
      
      // Pattern 1: result.result.tools (nested)
      if (result.result && typeof result.result === 'object' && Array.isArray((result.result as any).tools)) {
        toolsArray = (result.result as any).tools;
        console.log('Found tools via result.result.tools pattern');
      }
      // Pattern 2: result.result is the tools array directly
      else if (result.result && Array.isArray(result.result)) {
        toolsArray = result.result;
        console.log('Found tools via result.result pattern (direct array)');
      }
      // Pattern 3: result.tools (direct property)
      else if (Array.isArray((result as any).tools)) {
        toolsArray = (result as any).tools;
        console.log('Found tools via result.tools pattern');
      }
      // Pattern 4: result is the tools array itself
      else if (Array.isArray(result)) {
        toolsArray = result;
        console.log('Found tools via result pattern (result is array)');
      }
      
      if (toolsArray.length > 0) {
        console.log(`Processing ${toolsArray.length} raw tools:`, toolsArray.map(t => t.name || t));
        
        const mcpTools: MCPTool[] = toolsArray.map((tool: any) => ({
          name: tool.name,
          description: tool.description || '',
          inputSchema: tool.inputSchema,
        }));
        console.log(`Successfully converted ${mcpTools.length} tools`);
        return mcpTools;
      }
      
      console.log('No tools found in any expected pattern, returning empty array');
      return [];
    } catch (error) {
      console.error('Error discovering tools:', error);
      
      // Check if this is a Google Workspace MCP server that needs authentication
      if (command.includes('workspace-mcp')) {
        console.log('Google Workspace MCP server may need authentication completion - returning empty tools list');
        return [];
      }
      
      throw error;
    } finally {
      if (client) {
        await client.close();
      }
    }
  }

  /**
   * Execute a tool on an MCP server
   */
  async executeTool(
    command: string,
    toolName: string,
    args: any,
    environmentVariables?: Record<string, string>
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    let client: Client | null = null;
    
    try {
      client = await this.createMCPClient(command, environmentVariables);
      
      // Execute tool
      const result = await client.callTool({
        name: toolName,
        arguments: args
      });

      // Debug log the full result structure
      console.log(`=== MCP tool ${toolName} raw result ===`);
      console.log('Full result object:', JSON.stringify(result, null, 2));
      console.log('result.result:', result.result);
      console.log('result.result type:', typeof result.result);
      console.log('result keys:', Object.keys(result));
      console.log('===========================');

      if (result.isError) {
        const error = result.error as any;
        return { 
          success: false, 
          error: error && error.message ? String(error.message) : 'MCP server error' 
        };
      }

      // The MCP SDK might return the result in different ways
      // Check if result has a content array (structured response)
      let toolResult: any;
      
      if (result.result && typeof result.result === 'object' && 'content' in result.result && Array.isArray(result.result.content)) {
        // Handle structured MCP response
        const content = result.result.content;
        if (content.length > 0 && content[0].type === 'text') {
          toolResult = content[0].text;
        } else {
          toolResult = result.result;
        }
        console.log(`MCP tool ${toolName}: Using structured MCP response with content array`);
      } else if (result.result !== undefined) {
        // Direct result
        toolResult = result.result;
        console.log(`MCP tool ${toolName}: Using direct result`);
      } else if ('content' in result && Array.isArray(result.content)) {
        // Check if content is at the top level
        const content = result.content;
        if (content.length > 0 && content[0].type === 'text') {
          toolResult = content[0].text;
        } else {
          toolResult = content;
        }
        console.log(`MCP tool ${toolName}: Using top-level content array`);
      } else if (result && typeof result === 'object' && 'result' in result) {
        // Handle nested result
        toolResult = result.result;
        console.log(`MCP tool ${toolName}: Using nested result`);
      } else if (result && typeof result === 'object' && 'data' in result) {
        // Handle data field
        toolResult = result.data;
        console.log(`MCP tool ${toolName}: Using data field`);
      } else if (result && typeof result === 'object' && 'response' in result) {
        // Handle response field
        toolResult = result.response;
        console.log(`MCP tool ${toolName}: Using response field`);
      } else {
        // Fallback - return the entire result object
        toolResult = result;
        console.log(`MCP tool ${toolName}: Using fallback - entire result object`);
      }

      console.log(`MCP tool ${toolName} extracted result:`, {
        type: typeof toolResult,
        isNull: toolResult === null,
        isUndefined: toolResult === undefined,
        length: Array.isArray(toolResult) ? toolResult.length : 
                typeof toolResult === 'string' ? toolResult.length : 
                toolResult && typeof toolResult === 'object' ? Object.keys(toolResult).length : 0
      });

      return { 
        success: true, 
        result: toolResult 
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    } finally {
      if (client) {
        await client.close();
      }
    }
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
    const mcpTools = await this.discoverTools(server.command, server.environmentVariables as Record<string, string>);

    // Remove existing tools for this server
    // First, get the tool IDs to be deleted
    const existingTools = await db
      .select({ id: tools.id })
      .from(tools)
      .where(eq(tools.mcpServerId, serverId));
    
    const toolIds = existingTools.map(tool => tool.id);
    
    // Remove any API key associations to avoid foreign key constraint violations
    if (toolIds.length > 0) {
      await db
        .delete(apiKeyTools)
        .where(inArray(apiKeyTools.toolId, toolIds));
    }
    
    // Then remove the tools themselves
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
    const servers = await db.select().from(mcpServers);
    return servers.map(server => ({
      ...server,
      environmentVariables: server.environmentVariables as Record<string, string> | null
    }));
  }

  /**
   * Create a new MCP server
   */
  async createServer(serverData: {
    name: string;
    command: string;
    description?: string;
    allowedDirectories?: string[];
    environmentVariables?: Record<string, string>;
  }): Promise<MCPServer> {
    const [newServer] = await db
      .insert(mcpServers)
      .values(serverData)
      .returning();

    return {
      ...newServer,
      environmentVariables: newServer.environmentVariables as Record<string, string> | null
    };
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
      environmentVariables: Record<string, string>;
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