import cors, { CorsOptions } from 'cors';
import { Request } from 'express';
import { prisma } from '../db';
import { config } from '../config';

/**
 * Dynamic CORS middleware.
 *
 * In development: allows origins from DEV_ALLOWED_ORIGINS env var.
 * In production:  looks up the requesting origin against the partner's
 *                 allowedOrigins in the database.
 *
 * This means SewMyWears.com is only allowed because we explicitly configured
 * "sewmywears.com" in their partner record — no blanket wildcard access.
 */

// Cache origins for 60s to avoid DB lookup on every request
const originCache = new Map<string, { allowed: boolean; expiresAt: number }>();

async function isOriginAllowed(origin: string): Promise<boolean> {
  const now = Date.now();
  const cached = originCache.get(origin);
  if (cached && cached.expiresAt > now) return cached.allowed;

  // Always allow the app itself
  if (config.isDev && config.devAllowedOrigins.includes(origin)) {
    return true;
  }

  // Check against any partner's allowedOrigins
  const partner = await prisma.partner.findFirst({
    where: {
      isActive: true,
      allowedOrigins: { has: origin },
    },
    select: { id: true },
  });

  const allowed = !!partner;
  originCache.set(origin, { allowed, expiresAt: now + 60_000 });
  return allowed;
}

export function dynamicCors() {
  return cors((req: Request, callback: (err: Error | null, options?: CorsOptions) => void) => {
    const origin = req.headers.origin;

    // Non-browser requests (e.g. server-to-server) — allow without origin check
    if (!origin) {
      callback(null, { origin: false });
      return;
    }

    isOriginAllowed(origin)
      .then((allowed) => {
        callback(null, {
          origin: allowed ? origin : false,
          credentials: true,
          methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
          allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token'],
        });
      })
      .catch(() => callback(null, { origin: false }));
  });
}
