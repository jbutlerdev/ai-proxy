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
  
  // API is open - authentication is optional for tracking only
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Use anonymous API key for tracking
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