import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db';

/**
 * Middleware that validates a partner's API key.
 *
 * Partners include their clientId and secret in the Authorization header:
 *   Authorization: Bearer <clientId>:<apiSecret>
 *
 * The middleware attaches `req.partner` for downstream route handlers.
 */

declare global {
  namespace Express {
    interface Request {
      partner?: {
        id: string;
        clientId: string;
        name: string;
        allowedOrigins: string[];
      };
    }
  }
}

export async function requirePartnerAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  const [clientId, apiSecret] = token.split(':');
  if (!clientId || !apiSecret) {
    res.status(401).json({ error: 'Invalid credentials format. Expected: clientId:apiSecret' });
    return;
  }

  const partner = await prisma.partner.findUnique({
    where: { clientId },
    select: { id: true, clientId: true, name: true, secretKeyHash: true, allowedOrigins: true, isActive: true },
  });

  if (!partner || !partner.isActive) {
    res.status(401).json({ error: 'Unknown or inactive partner' });
    return;
  }

  const bcrypt = await import('bcrypt');
  const valid = await bcrypt.compare(apiSecret, partner.secretKeyHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  req.partner = {
    id: partner.id,
    clientId: partner.clientId,
    name: partner.name,
    allowedOrigins: partner.allowedOrigins,
  };

  next();
}

/**
 * Digitcan admin-only middleware (used for partner management endpoints).
 */
export function requireAdminKey(req: Request, res: Response, next: NextFunction): void {
  const { config } = require('../config');
  const key = req.headers['x-digitcan-admin-key'];
  if (key !== config.adminKey) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}
