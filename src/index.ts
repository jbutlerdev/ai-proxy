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
const port = process.env.PORT || 3000;

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
    etag: false
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