import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { apiKeys } from '../db/schema';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  apiKey?: {
    id: number;
    key: string;
    name: string;
  };
  isAdmin?: boolean;
}

async function getAnonymousApiKey() {
  try {
    const results = await db
      .select({
        id: apiKeys.id,
        key: apiKeys.key,
        name: apiKeys.name,
      })
      .from(apiKeys)
      .where(eq(apiKeys.key, 'anonymous'))
      .limit(1);

    if (results.length > 0) {
      return results[0];
    }
  } catch (error) {
    console.error('Error getting anonymous API key:', error);
  }

  // Fallback if anonymous key not found
  return {
    id: 0,
    key: 'anonymous',
    name: 'Anonymous'
  };
}

export async function authenticateApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  
  // Require authorization header
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: {
        message: 'No API key provided. Please include Authorization: Bearer <api-key> header.',
        type: 'invalid_request_error',
        code: 'invalid_api_key'
      }
    });
  }

  const apiKey = authHeader.substring(7);

  try {
    const results = await db
      .select({
        id: apiKeys.id,
        key: apiKeys.key,
        name: apiKeys.name,
        active: apiKeys.active,
      })
      .from(apiKeys)
      .where(eq(apiKeys.key, apiKey))
      .limit(1);

    if (results.length === 0) {
      return res.status(401).json({
        error: {
          message: 'Invalid API key provided.',
          type: 'invalid_request_error',
          code: 'invalid_api_key'
        }
      });
    }

    if (!results[0].active) {
      return res.status(401).json({
        error: {
          message: 'API key has been disabled.',
          type: 'invalid_request_error',
          code: 'invalid_api_key'
        }
      });
    }

    req.apiKey = results[0];
    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({
      error: {
        message: 'Internal server error during authentication.',
        type: 'server_error',
        code: 'server_error'
      }
    });
  }
}

export async function authenticateApiKeyOptional(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  
  // If no auth header, use anonymous API key for tracking
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.apiKey = await getAnonymousApiKey();
    return next();
  }

  const apiKey = authHeader.substring(7);

  try {
    const results = await db
      .select({
        id: apiKeys.id,
        key: apiKeys.key,
        name: apiKeys.name,
        active: apiKeys.active,
      })
      .from(apiKeys)
      .where(eq(apiKeys.key, apiKey))
      .limit(1);

    if (results.length === 0 || !results[0].active) {
      // Invalid key provided, but still allow access as anonymous
      req.apiKey = await getAnonymousApiKey();
    } else {
      req.apiKey = results[0];
    }
    
    next();
  } catch (error) {
    console.error('Auth error:', error);
    // On error, continue as anonymous
    req.apiKey = await getAnonymousApiKey();
    next();
  }
}

export function authenticateAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  // No authentication required - open access to admin interface
  req.isAdmin = true;
  next();
}

export function generateAdminToken(): string {
  return jwt.sign({ admin: true }, process.env.JWT_SECRET || 'secret', {
    expiresIn: '24h',
  });
}