import { Router } from 'express';
import { authenticateAdmin } from '../middleware/auth';
import { db } from '../db';
import { apiKeys, tools, apiKeyTools, conversations, messages, upstreamServers, upstreamModels, mcpServers } from '../db/schema';
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { generateAdminToken } from '../middleware/auth';
import { CreateApiKeyRequest, CreateToolRequest, UpdateToolRequest } from '../types';
import { MCPService } from '../services/mcp-service';

const router = Router();

// Admin login
router.post('/login', async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  // In production, you'd store this hashed in the database
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (password !== adminPassword) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = generateAdminToken();
  res.json({ token });
});

// API Key Management
router.get('/api-keys', authenticateAdmin, async (req, res) => {
  try {
    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        key: apiKeys.key,
        active: apiKeys.active,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .orderBy(desc(apiKeys.createdAt));

    res.json(keys);
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

router.post('/api-keys', authenticateAdmin, async (req, res) => {
  try {
    const { name }: CreateApiKeyRequest = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name required' });
    }

    const key = `pk-${uuidv4()}`;

    const [newKey] = await db
      .insert(apiKeys)
      .values({ key, name })
      .returning();

    res.json(newKey);
  } catch (error) {
    console.error('Error creating API key:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

router.patch('/api-keys/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { active } = req.body;

    await db
      .update(apiKeys)
      .set({ active, updatedAt: new Date() })
      .where(eq(apiKeys.id, parseInt(id)));

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating API key:', error);
    res.status(500).json({ error: 'Failed to update API key' });
  }
});

// Tool Management
router.get('/tools', authenticateAdmin, async (req, res) => {
  try {
    const allTools = await db
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
        createdAt: tools.createdAt,
        updatedAt: tools.updatedAt,
        // Include MCP server active status
        mcpServerActive: mcpServers.active,
      })
      .from(tools)
      .leftJoin(mcpServers, eq(tools.mcpServerId, mcpServers.id))
      .orderBy(desc(tools.createdAt));

    // Map the results to include a computed active field that considers MCP server status
    const toolsWithComputedActive = allTools.map(tool => ({
      ...tool,
      // A tool is only active if it's active AND (if it's an MCP tool, its server is also active)
      active: tool.active && (tool.mcpServerId === null || tool.mcpServerActive === true)
    }));

    res.json(toolsWithComputedActive);
  } catch (error) {
    console.error('Error fetching tools:', error);
    res.status(500).json({ error: 'Failed to fetch tools' });
  }
});

router.post('/tools', authenticateAdmin, async (req, res) => {
  try {
    const toolData: CreateToolRequest = req.body;

    const [newTool] = await db
      .insert(tools)
      .values(toolData)
      .returning();

    res.json(newTool);
  } catch (error) {
    console.error('Error creating tool:', error);
    res.status(500).json({ error: 'Failed to create tool' });
  }
});

router.patch('/tools/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates: UpdateToolRequest = req.body;

    await db
      .update(tools)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tools.id, parseInt(id)));

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating tool:', error);
    res.status(500).json({ error: 'Failed to update tool' });
  }
});

// API Key Tool Assignment
router.get('/api-keys/:apiKeyId/tools', authenticateAdmin, async (req, res) => {
  try {
    const { apiKeyId } = req.params;

    const assignedTools = await db
      .select({
        toolId: tools.id,
        name: tools.name,
        description: tools.description,
        type: tools.type,
        enabled: apiKeyTools.enabled,
      })
      .from(apiKeyTools)
      .innerJoin(tools, eq(tools.id, apiKeyTools.toolId))
      .where(eq(apiKeyTools.apiKeyId, parseInt(apiKeyId)));

    res.json(assignedTools);
  } catch (error) {
    console.error('Error fetching API key tools:', error);
    res.status(500).json({ error: 'Failed to fetch API key tools' });
  }
});

router.post('/api-keys/:apiKeyId/tools/:toolId', authenticateAdmin, async (req, res) => {
  try {
    const { apiKeyId, toolId } = req.params;

    await db
      .insert(apiKeyTools)
      .values({
        apiKeyId: parseInt(apiKeyId),
        toolId: parseInt(toolId),
      })
      .onConflictDoUpdate({
        target: [apiKeyTools.apiKeyId, apiKeyTools.toolId],
        set: { enabled: true },
      });

    res.json({ success: true });
  } catch (error) {
    console.error('Error assigning tool:', error);
    res.status(500).json({ error: 'Failed to assign tool' });
  }
});

router.delete('/api-keys/:apiKeyId/tools/:toolId', authenticateAdmin, async (req, res) => {
  try {
    const { apiKeyId, toolId } = req.params;

    await db
      .update(apiKeyTools)
      .set({ enabled: false })
      .where(
        and(
          eq(apiKeyTools.apiKeyId, parseInt(apiKeyId)),
          eq(apiKeyTools.toolId, parseInt(toolId))
        )
      );

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing tool:', error);
    res.status(500).json({ error: 'Failed to remove tool' });
  }
});

// Conversation Logs
router.get('/conversations', authenticateAdmin, async (req, res) => {
  try {
    const { apiKeyId, startDate, endDate } = req.query;

    let whereConditions: any[] = [];
    
    if (apiKeyId) {
      whereConditions.push(eq(conversations.apiKeyId, parseInt(apiKeyId as string)));
    }

    if (startDate) {
      whereConditions.push(gte(conversations.startedAt, new Date(startDate as string)));
    }

    if (endDate) {
      whereConditions.push(lte(conversations.startedAt, new Date(endDate as string)));
    }

    // Build WHERE clause for SQL query
    let whereClause = '';
    let params: any[] = [];
    
    if (whereConditions.length > 0) {
      const conditions = [];
      let paramIndex = 1;
      
      if (apiKeyId) {
        conditions.push(`c.api_key_id = ${paramIndex}`);
        params.push(parseInt(apiKeyId as string));
        paramIndex++;
      }
      
      if (startDate) {
        conditions.push(`c.started_at >= ${paramIndex}`);
        params.push(new Date(startDate as string));
        paramIndex++;
      }
      
      if (endDate) {
        conditions.push(`c.started_at <= ${paramIndex}`);
        params.push(new Date(endDate as string));
        paramIndex++;
      }
      
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    // Calculate correct total tokens using SQL
    const conversationsWithCorrectTotals = await db.execute(sql`
      SELECT 
        c.id,
        c.api_key_id as "apiKeyId",
        ak.name as "apiKeyName",
        c.model,
        c.started_at as "startedAt",
        c.ended_at as "endedAt",
        c.total_cost as "totalCost",
        (COALESCE(SUM(m.request_tokens), 0) + COALESCE(SUM(m.response_tokens), 0) + COALESCE(SUM(m.reasoning_tokens), 0))::INTEGER as "totalTokensUsed"
      FROM conversations c
      INNER JOIN api_keys ak ON c.api_key_id = ak.id
      LEFT JOIN messages m ON c.id = m.conversation_id
      ${whereClause ? sql.raw(whereClause) : sql``}
      GROUP BY c.id, c.api_key_id, ak.name, c.model, c.started_at, c.ended_at, c.total_cost
      ORDER BY c.started_at DESC
      LIMIT 100
    `);

    res.json(conversationsWithCorrectTotals.rows);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

router.get('/conversations/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [conversationData] = await db
      .select()
      .from(conversations)
      .leftJoin(apiKeys, eq(conversations.apiKeyId, apiKeys.id))
      .where(eq(conversations.id, id))
      .limit(1);

    if (!conversationData) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const conversation = {
      ...conversationData.conversations,
      apiKeyName: conversationData.api_keys?.name || 'anonymous',
    };

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const conversationMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(messages.createdAt);

    res.json({
      ...conversation,
      messages: conversationMessages,
    });
  } catch (error) {
    console.error('Error fetching conversation details:', error);
    res.status(500).json({ error: 'Failed to fetch conversation details' });
  }
});

// Upstream Server Management
router.get('/upstream-servers', authenticateAdmin, async (req, res) => {
  try {
    const servers = await db
      .select({
        id: upstreamServers.id,
        name: upstreamServers.name,
        baseUrl: upstreamServers.baseUrl,
        active: upstreamServers.active,
        description: upstreamServers.description,
        createdAt: upstreamServers.createdAt,
        hasApiKey: sql<boolean>`CASE WHEN api_key IS NOT NULL AND api_key != '' THEN true ELSE false END`,
      })
      .from(upstreamServers)
      .orderBy(desc(upstreamServers.createdAt));

    res.json(servers);
  } catch (error) {
    console.error('Error fetching upstream servers:', error);
    res.status(500).json({ error: 'Failed to fetch upstream servers' });
  }
});

router.post('/upstream-servers', authenticateAdmin, async (req, res) => {
  try {
    const { name, baseUrl, apiKey, description, headers } = req.body;

    if (!name || !baseUrl) {
      return res.status(400).json({ error: 'Name and base URL are required' });
    }

    const [newServer] = await db
      .insert(upstreamServers)
      .values({ 
        name, 
        baseUrl, 
        apiKey: apiKey || null, 
        description, 
        headers 
      })
      .returning();

    res.json(newServer);
  } catch (error) {
    console.error('Error creating upstream server:', error);
    res.status(500).json({ error: 'Failed to create upstream server' });
  }
});

router.patch('/upstream-servers/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, baseUrl, apiKey, description, headers, active } = req.body;

    await db
      .update(upstreamServers)
      .set({ 
        ...(name !== undefined && { name }),
        ...(baseUrl !== undefined && { baseUrl }),
        ...(apiKey !== undefined && { apiKey }),
        ...(description !== undefined && { description }),
        ...(headers !== undefined && { headers }),
        ...(active !== undefined && { active }),
        updatedAt: new Date() 
      })
      .where(eq(upstreamServers.id, parseInt(id)));

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating upstream server:', error);
    res.status(500).json({ error: 'Failed to update upstream server' });
  }
});

router.delete('/upstream-servers/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Delete associated models first
    await db
      .delete(upstreamModels)
      .where(eq(upstreamModels.upstreamServerId, parseInt(id)));

    // Delete the server
    await db
      .delete(upstreamServers)
      .where(eq(upstreamServers.id, parseInt(id)));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting upstream server:', error);
    res.status(500).json({ error: 'Failed to delete upstream server' });
  }
});

// Model Management
router.get('/upstream-servers/:serverId/models', authenticateAdmin, async (req, res) => {
  try {
    const { serverId } = req.params;

    const models = await db
      .select()
      .from(upstreamModels)
      .where(eq(upstreamModels.upstreamServerId, parseInt(serverId)))
      .orderBy(upstreamModels.displayName);

    res.json(models);
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

router.post('/upstream-servers/:serverId/sync-models', authenticateAdmin, async (req, res) => {
  try {
    const { serverId } = req.params;

    // Get the server details
    const [server] = await db
      .select()
      .from(upstreamServers)
      .where(eq(upstreamServers.id, parseInt(serverId)))
      .limit(1);

    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Fetch models from the upstream server
    const modelsUrl = `${server.baseUrl.replace(/\/$/, '')}/v1/models`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (server.apiKey) {
      headers['Authorization'] = `Bearer ${server.apiKey}`;
    }

    // Add custom headers
    if (server.headers) {
      Object.assign(headers, server.headers);
    }

    const response = await fetch(modelsUrl, { headers });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
    }

    const modelsData = await response.json();
    
    if (!modelsData.data || !Array.isArray(modelsData.data)) {
      throw new Error('Invalid response format from upstream server');
    }

    // Update models in database
    const now = new Date();
    const modelUpdates = [];

    for (const model of modelsData.data) {
      const existingModel = await db
        .select()
        .from(upstreamModels)
        .where(
          and(
            eq(upstreamModels.upstreamServerId, parseInt(serverId)),
            eq(upstreamModels.modelId, model.id)
          )
        )
        .limit(1);

      if (existingModel.length > 0) {
        // Update existing model
        await db
          .update(upstreamModels)
          .set({
            displayName: model.id, // Use model ID as display name by default
            capabilities: model,
            lastSynced: now,
            updatedAt: now,
          })
          .where(eq(upstreamModels.id, existingModel[0].id));
      } else {
        // Insert new model
        modelUpdates.push({
          upstreamServerId: parseInt(serverId),
          modelId: model.id,
          displayName: model.id,
          enabled: false,
          capabilities: model,
          lastSynced: now,
        });
      }
    }

    if (modelUpdates.length > 0) {
      await db.insert(upstreamModels).values(modelUpdates);
    }

    // Get updated models list
    const updatedModels = await db
      .select()
      .from(upstreamModels)
      .where(eq(upstreamModels.upstreamServerId, parseInt(serverId)))
      .orderBy(upstreamModels.displayName);

    res.json(updatedModels);
  } catch (error) {
    console.error('Error syncing models:', error);
    res.status(500).json({ error: `Failed to sync models: ${error instanceof Error ? error.message : 'Unknown error'}` });
  }
});

router.patch('/upstream-models/:modelId', authenticateAdmin, async (req, res) => {
  try {
    const { modelId } = req.params;
    const { enabled, displayName } = req.body;

    await db
      .update(upstreamModels)
      .set({
        ...(enabled !== undefined && { enabled }),
        ...(displayName !== undefined && { displayName }),
        updatedAt: new Date(),
      })
      .where(eq(upstreamModels.id, parseInt(modelId)));

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating model:', error);
    if (error instanceof Error && error.message.includes('unique_enabled_model_idx')) {
      res.status(400).json({ error: 'A model with this name is already enabled. Please choose a different display name or disable the conflicting model.' });
    } else {
      res.status(500).json({ error: 'Failed to update model' });
    }
  }
});

router.get('/available-models', authenticateAdmin, async (req, res) => {
  try {
    const models = await db
      .select({
        id: upstreamModels.id,
        modelId: upstreamModels.modelId,
        displayName: upstreamModels.displayName,
        enabled: upstreamModels.enabled,
        serverName: upstreamServers.name,
        serverBaseUrl: upstreamServers.baseUrl,
        capabilities: upstreamModels.capabilities,
      })
      .from(upstreamModels)
      .innerJoin(upstreamServers, eq(upstreamServers.id, upstreamModels.upstreamServerId))
      .where(eq(upstreamModels.enabled, true))
      .orderBy(upstreamModels.displayName);

    res.json(models);
  } catch (error) {
    console.error('Error fetching available models:', error);
    res.status(500).json({ error: 'Failed to fetch available models' });
  }
});

// MCP Server Management
const mcpService = new MCPService();

router.get('/mcp-servers', authenticateAdmin, async (req, res) => {
  try {
    const servers = await mcpService.getServers();
    res.json(servers);
  } catch (error) {
    console.error('Error fetching MCP servers:', error);
    res.status(500).json({ error: 'Failed to fetch MCP servers' });
  }
});

router.post('/mcp-servers', authenticateAdmin, async (req, res) => {
  try {
    const { name, command, description, allowedDirectories, environmentVariables } = req.body;

    if (!name || !command) {
      return res.status(400).json({ error: 'Name and command are required' });
    }

    const newServer = await mcpService.createServer({
      name,
      command,
      description,
      allowedDirectories: allowedDirectories || [],
      environmentVariables: environmentVariables || {},
    });

    res.json(newServer);
  } catch (error) {
    console.error('Error creating MCP server:', error);
    res.status(500).json({ error: 'Failed to create MCP server' });
  }
});

router.patch('/mcp-servers/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, command, description, allowedDirectories, environmentVariables, active } = req.body;

    await mcpService.updateServer(parseInt(id), {
      ...(name !== undefined && { name }),
      ...(command !== undefined && { command }),
      ...(description !== undefined && { description }),
      ...(allowedDirectories !== undefined && { allowedDirectories }),
      ...(environmentVariables !== undefined && { environmentVariables }),
      ...(active !== undefined && { active }),
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating MCP server:', error);
    res.status(500).json({ error: 'Failed to update MCP server' });
  }
});

router.delete('/mcp-servers/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await mcpService.deleteServer(parseInt(id));
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting MCP server:', error);
    res.status(500).json({ error: 'Failed to delete MCP server' });
  }
});

router.post('/mcp-servers/:id/discover-tools', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get server details
    const [server] = await db
      .select()
      .from(mcpServers)
      .where(eq(mcpServers.id, parseInt(id)))
      .limit(1);

    if (!server) {
      return res.status(404).json({ error: 'MCP server not found' });
    }

    // Discover tools from the server
    const discoveredTools = await mcpService.discoverTools(server.command, server.environmentVariables as Record<string, string>);
    res.json(discoveredTools);
  } catch (error) {
    console.error('Error discovering MCP tools:', error);
    res.status(500).json({ error: `Failed to discover tools: ${error instanceof Error ? error.message : 'Unknown error'}` });
  }
});

router.post('/mcp-servers/:id/sync-tools', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await mcpService.syncServerTools(parseInt(id));
    
    // Return the updated tools for this server
    const syncedTools = await db
      .select()
      .from(tools)
      .where(eq(tools.mcpServerId, parseInt(id)))
      .orderBy(tools.name);

    res.json(syncedTools);
  } catch (error) {
    console.error('Error syncing MCP tools:', error);
    res.status(500).json({ error: `Failed to sync tools: ${error instanceof Error ? error.message : 'Unknown error'}` });
  }
});

router.post('/mcp-servers/:id/get-auth-url', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get server details
    const [server] = await db
      .select()
      .from(mcpServers)
      .where(eq(mcpServers.id, parseInt(id)))
      .limit(1);

    if (!server) {
      return res.status(404).json({ error: 'MCP server not found' });
    }

    // Get the auth URL
    const authUrl = await mcpService.getAuthUrl(server.command, server.environmentVariables as Record<string, string>);
    res.json({ authUrl });
  } catch (error) {
    console.error('Error getting MCP auth URL:', error);
    res.status(500).json({ error: `Failed to get auth URL: ${error instanceof Error ? error.message : 'Unknown error'}` });
  }
});

router.post('/mcp-servers/:id/check-auth', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get server details
    const [server] = await db
      .select()
      .from(mcpServers)
      .where(eq(mcpServers.id, parseInt(id)))
      .limit(1);

    if (!server) {
      return res.status(404).json({ error: 'MCP server not found' });
    }

    // Check authentication status
    const hostHeader = req.get('host');
    const authResult = await mcpService.checkAuthentication(server.command, server.environmentVariables as Record<string, string>, hostHeader);
    res.json(authResult);
  } catch (error) {
    console.error('Error checking MCP authentication:', error);
    res.status(500).json({ error: `Failed to check authentication: ${error instanceof Error ? error.message : 'Unknown error'}` });
  }
});


export default router;
