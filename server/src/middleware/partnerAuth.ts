import bcrypt from 'bcrypt';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db';

/**
 * Middleware to validate partner API keys for non-browser calls.
 *
 * Behavior:
 * - If request has an Origin header and dynamic CORS allows it, assume browser flow and allow.
 * - Otherwise, require X-Partner-Key header containing the partner secret (plain text), which is compared to the bcrypt hash stored in Partner.secretKeyHash.
 * - On success, attaches req.partner (id, clientId) for downstream handlers.
 */

declare global {
  namespace Express {
    interface Request {
      partner?: { id: string; clientId: string };
    }
  }
}

export async function requirePartnerKey(req: Request, _res: Response, next: NextFunction) {
  try {
    // If request has an Origin and it's allowed via CORS middleware, downstream will rely on CORS checks.
    // We still allow Origin-based browser flows without API key here.
    const origin = req.headers.origin as string | undefined;
    if (origin) {
      // Treat as browser-origin flow — partner verification is performed by dynamicCors.
      return next();
    }

    const provided = req.header('X-Partner-Key') || req.header('Authorization')?.replace('Bearer ', '') || null;
    if (!provided) {
      return next(new Error('Missing partner API key'));
    }

    // We expect client identifier in query or body (clientId) for key validation
    const externalClientId = (req.body?.clientId || req.query?.clientId || req.params?.clientId) as string | undefined;
    if (!externalClientId) {
      return next(new Error('Missing client identifier for partner key validation'));
    }

    const partner = await prisma.partner.findUnique({ where: { clientId: externalClientId } });
    if (!partner || !partner.secretKeyHash) return next(new Error('Unknown partner'));

    const ok = await bcrypt.compare(provided, partner.secretKeyHash);
    if (!ok) return next(new Error('Invalid partner API key'));

    req.partner = { id: partner.id, clientId: partner.clientId };
    return next();
  } catch (err) {
    return next(err);
  }
}
