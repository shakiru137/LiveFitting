import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { config } from '../config';
import { generateSessionRef } from '../utils/session';

const router = Router();

const CreateSessionSchema = z.object({
  clientId: z.string().min(1),
  customerId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

function extractParam(val: string | string[] | undefined): string | undefined {
  if (Array.isArray(val)) return val[0];
  return val;
}

// ─── POST /api/sessions ──────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const body = {
    clientId:   extractParam(req.body.clientId   ?? req.query.clientId),
    customerId: extractParam(req.body.customerId  ?? req.query.customerId),
    metadata:   req.body.metadata,
  };

  const parsed = CreateSessionSchema.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const { clientId: externalClientId, customerId, metadata } = parsed.data;

  // 1. Resolve Partner by external string identifier (Partner.clientId)
  let partner = await prisma.partner.findUnique({
    where: { clientId: externalClientId },
  });

  // Auto-provision demo partners if they don't exist yet (DEV ONLY)
  if (!partner && config.isDev && ['demo-client', 'digitcan', 'sewmywears'].includes(externalClientId.toLowerCase())) {
    partner = await prisma.partner.upsert({
      where: { clientId: externalClientId },
      create: {
        clientId: externalClientId,
        name: `${externalClientId} Partner`,
        // demo-only placeholder secret — overwritten by seed when appropriate
        secretKeyHash: '$2b$12$e0MYzXy.Xk5.demoDummySecretHashForAutoCreatedPartners',
        allowedOrigins: config.devAllowedOrigins,
        isActive: true,
      },
      update: { isActive: true },
    });
    console.log(`[SessionCreate] Auto-provisioned demo partner for clientId=${externalClientId} (dev-only)`);
  }

  // 2. Verify Partner is active
  if (!partner || !partner.isActive) {
    res.status(401).json({ error: 'Unknown or inactive partner' });
    return;
  }

  // Safe logging requested for verification (avoid logging secrets)
  console.log(`[SessionCreate] received external clientId: "${externalClientId}", resolved Partner.clientId: "${partner.clientId}"`);

  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 60 * 60 * 1000);
  const sessionRef = generateSessionRef();

  const ipHeader = req.headers['x-forwarded-for'];
  const rawIp = Array.isArray(ipHeader) ? ipHeader[0] : ipHeader;
  const ipAddress = rawIp?.split(',')[0]?.trim() ?? req.ip ?? null;

  // 3. Create Session linking foreign key Partner.clientId
  const session = await prisma.session.create({
    data: {
      sessionRef,
      clientId: partner.clientId,
      customerId: customerId ?? null,
      status: 'PENDING',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metadata: (metadata ?? {}) as any,
      userAgent: req.headers['user-agent'] ?? null,
      ipAddress,
      expiresAt,
    },
    select: { id: true, sessionRef: true, status: true, createdAt: true, expiresAt: true },
  });

  // Persist session_created event for telemetry/audit
  try {
    await prisma.sessionEvent.create({
      data: {
        sessionId: session.id,
        type: 'session.created',
        payload: {
          clientId: partner.clientId,
          customerId: customerId ?? null,
          metadata: metadata ?? {},
        },
      },
    });
  } catch (err) {
    console.error('[SessionCreate] Failed to persist session event:', err);
  }

  // 4. Return external clientId in response contract
  res.status(201).json({
    session: {
      sessionRef: session.sessionRef,
      clientId: partner.clientId,
      status: session.status,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    },
  });
});

// ─── GET /api/sessions/:ref ────────────────────────────────────────────────────
router.get('/:ref', async (req: Request, res: Response): Promise<void> => {
  const refStr = Array.isArray(req.params.ref) ? req.params.ref[0] : req.params.ref;
  const session = await prisma.session.findUnique({
    where: { sessionRef: refStr },
    include: {
      partner: { select: { clientId: true } },
      measurements: {
        select: {
          engineVersion: true, heightCm: true, headCircumferenceCm: true,
          neckCircumferenceCm: true, shoulderWidthCm: true, chestGirthCm: true,
          waistGirthCm: true, hipGirthCm: true, torsoLengthCm: true, sleeveLengthCm: true,
          trouserLengthCm: true, skirtLengthCm: true, suggestedSize: true,
          overallConfidence: true, qualityGrade: true, framesAnalyzed: true, capturedAt: true,
        },
        orderBy: { capturedAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  res.json({
    session: {
      sessionRef: session.sessionRef,
      clientId: session.partner.clientId, // Return external partner identifier
      status: session.status,
      createdAt: session.createdAt,
      completedAt: session.completedAt,
      measurements: session.measurements[0] ?? null,
    },
  });
});

// ─── PATCH /api/sessions/:ref/status ──────────────────────────────────────────
router.patch('/:ref/status', async (req: Request, res: Response): Promise<void> => {
  const refStr = Array.isArray(req.params.ref) ? req.params.ref[0] : req.params.ref;
  const { status } = req.body as { status: string };
  const valid = ['PENDING', 'ACTIVE', 'MEASURING', 'COMPLETE', 'FAILED'] as const;
  type S = typeof valid[number];

  if (!valid.includes(status as S)) {
    res.status(400).json({ error: 'Invalid status', valid });
    return;
  }

  const session = await prisma.session.findUnique({ where: { sessionRef: refStr } });
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  const updates: Record<string, unknown> = { status: status as S };
  if (status === 'COMPLETE') updates.completedAt = new Date();
  if (status === 'ACTIVE') updates['cameraGrantedAt'] = new Date();
  if (status === 'MEASURING') updates['measurementStartedAt'] = new Date();
  if (status === 'FAILED') updates['completedAt'] = new Date();

  const updated = await prisma.session.update({
    where: { sessionRef: refStr },
    data: updates,
    select: { sessionRef: true, status: true, updatedAt: true },
  });

  // Persist status change event
  try {
    await prisma.sessionEvent.create({
      data: {
        sessionId: session.id,
        type: 'session.status_changed',
        payload: { status: updated.status },
      },
    });
  } catch (err) {
    console.error('[SessionStatus] Failed to persist session status event:', err);
  }

  res.json({ session: updated });
});

export default router;
