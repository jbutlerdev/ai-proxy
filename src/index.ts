import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { authenticateApiKey } from './middleware/auth';
import adminRoutes from './api/admin-routes';
import { ProxyHandler } from './api/proxy-handler';

dotenv.config();

const app = express();
const port = process.env.APP_PORT || process.env.PORT || 3002;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes first
app.use('/api/admin', adminRoutes);

// OAuth callback route (needs to be accessible without authentication)
app.get('/oauth2callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    console.log('OAuth callback received:', { code: code ? 'present' : 'missing', state, query: req.query });
    
    if (!code) {
      console.log('OAuth callback error: Missing authorization code');
      return res.status(400).send('Missing authorization code');
    }

    // Exchange authorization code for access and refresh tokens
    try {
      const { db } = await import('./db');
      const { mcpServers } = await import('./db/schema');
      const { eq } = await import('drizzle-orm');
      
      // Find the workspace MCP server
      const [server] = await db
        .select()
        .from(mcpServers)
        .where(eq(mcpServers.command, 'uvx workspace-mcp --single-user'))
        .limit(1);
      
      if (server) {
        const envVars = server.environmentVariables as any;
        const clientId = envVars?.GOOGLE_OAUTH_CLIENT_ID;
        const clientSecret = envVars?.GOOGLE_OAUTH_CLIENT_SECRET;
        
        if (!clientId || !clientSecret) {
          throw new Error('Missing OAuth configuration');
        }
        
        // Determine the correct redirect URI based on the request
        const host = req.get('host');
        const protocol = host && !host.includes('localhost') ? 'https' : 'http';
        const redirectUri = `${protocol}://${host}/oauth2callback`;
        
        console.log(`Using redirect URI: ${redirectUri}`);
        
        // Exchange authorization code for tokens
        const axios = (await import('axios')).default;
        let tokenResponse;
        try {
          tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
            code: code as string,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code'
          });
          console.log('Token exchange successful');
        } catch (tokenError: any) {
          console.error('Token exchange failed:', tokenError.response?.data);
          throw tokenError;
        }
        
        const { access_token, refresh_token, expires_in, scope } = tokenResponse.data;
        
        // Calculate expiry time
        const expiryDate = new Date(Date.now() + (expires_in * 1000));
        
        // Get user info to determine email
        let userEmail = 'default@example.com'; // Default email if user info fails
        try {
          const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v1/userinfo', {
            headers: {
              Authorization: `Bearer ${access_token}`
            }
          });
          userEmail = userInfoResponse.data.email;
          console.log('User info retrieved successfully:', userEmail);
        } catch (userInfoError: any) {
          console.error('Failed to get user info, using default email:', userInfoError.response?.data || userInfoError.message);
          // Continue with default email - the tokens are still valid
        }
        
        // Create credentials file for workspace MCP server
        const fs = await import('fs');
        const path = await import('path');
        
        const credentialsDir = '/home/openai-proxy/.google_workspace_mcp/credentials';
        const credentialsFile = path.join(credentialsDir, `${userEmail}.json`);
        
        // Create directory if it doesn't exist
        await fs.promises.mkdir(credentialsDir, { recursive: true });
        
        // Create credentials file in the expected format
        const credentials = {
          token: access_token,
          refresh_token: refresh_token,
          token_uri: 'https://oauth2.googleapis.com/token',
          client_id: clientId,
          client_secret: clientSecret,
          scopes: scope ? scope.split(' ') : [],
          expiry: expiryDate.toISOString()
        };
        
        await fs.promises.writeFile(credentialsFile, JSON.stringify(credentials, null, 2));
        console.log('Workspace MCP credentials file created:', credentialsFile);
        
        // Update the server's environment variables to mark as authenticated
        const updatedEnvVars: any = {
          ...(server.environmentVariables || {}),
          GOOGLE_OAUTH_AUTHENTICATED: 'true',
          GOOGLE_OAUTH_USER_EMAIL: userEmail,
          GOOGLE_OAUTH_TIMESTAMP: new Date().toISOString()
        };
        
        await db
          .update(mcpServers)
          .set({ 
            environmentVariables: updatedEnvVars,
            updatedAt: new Date()
          })
          .where(eq(mcpServers.id, server.id));
        
        console.log('OAuth tokens exchanged and stored for workspace MCP server');
        
      } else {
        console.warn('Workspace MCP server not found to store OAuth tokens');
        throw new Error('Workspace MCP server not found');
      }
    } catch (error: any) {
      console.error('Error exchanging OAuth authorization code:', error);
      if (error.response?.data) {
        console.error('OAuth error details:', JSON.stringify(error.response.data, null, 2));
      }
      return res.status(500).send(`
        <html>
          <head><title>Authentication Error</title></head>
          <body>
            <h1>Authentication Error</h1>
            <p>Failed to exchange authorization code for tokens.</p>
            <p>Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
            ${error.response?.data?.error_description ? `<p>Details: ${error.response.data.error_description}</p>` : ''}
            ${error.response?.data?.error ? `<p>Error code: ${typeof error.response.data.error === 'object' ? JSON.stringify(error.response.data.error) : error.response.data.error}</p>` : ''}
            <p>Please ensure that the redirect URI is added as an authorized redirect URI in your Google Cloud Console OAuth client settings.</p>
          </body>
        </html>
      `);
    }
    
    res.send(`
      <html>
        <head><title>Authentication Successful</title></head>
        <body>
          <h1>Authentication Successful!</h1>
          <p>You have successfully authenticated with Google Workspace.</p>
          <p>Access tokens obtained and stored for processing.</p>
          <p>You can now close this tab and return to the admin interface to sync your tools.</p>
          <script>
            setTimeout(() => window.close(), 3000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error handling OAuth callback:', error);
    res.status(500).send('Internal server error');
  }
});

// OpenAI API proxy endpoints
const proxyHandler = new ProxyHandler();

// Models endpoint
app.get('/v1/models', authenticateApiKey, async (req, res) => {
  await proxyHandler.handleModels(req, res);
});

// Chat completions endpoint
app.post('/v1/chat/completions', authenticateApiKey, async (req, res) => {
  await proxyHandler.handleChatCompletion(req, res);
});

// Completions endpoint (legacy)
app.post('/v1/completions', authenticateApiKey, async (req, res) => {
  await proxyHandler.handleCompletions(req, res);
});

// Embeddings endpoint
app.post('/v1/embeddings', authenticateApiKey, async (req, res) => {
  await proxyHandler.handleEmbeddings(req, res);
});

// Serve admin UI in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../public'), {
    maxAge: 0,
    etag: false,
    setHeaders: (res, filePath) => {
      // Set proper MIME type for manifest.json
      if (filePath.endsWith('manifest.json')) {
        res.setHeader('Content-Type', 'application/manifest+json');
      }
      // Set cache control for service worker
      if (filePath.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  }));
  
  // Only catch non-API routes
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/v1')) {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    }
  });
}

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// Start server
app.listen(port, () => {
  console.log(`OpenAI Proxy Server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});