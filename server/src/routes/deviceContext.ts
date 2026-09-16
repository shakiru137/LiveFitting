import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requirePartnerKey } from '../middleware/partnerAuth';

const router = Router();

const DeviceContextSchema = z.object({
  deviceClass: z.string().optional(),
  browser: z.string().optional(),
  browserVersion: z.string().optional(),
  os: z.string().optional(),
  screenWidth: z.number().int().optional(),
  screenHeight: z.number().int().optional(),
  devicePixelRatio: z.number().optional(),
  cameraResolutionW: z.number().int().optional(),
  cameraResolutionH: z.number().int().optional(),
  facingMode: z.string().optional(),
});

// Merge device context at session creation endpoint — compatible with existing POST /api/sessions
// Note: This router is designed to be a companion but the sessions route will call the persistence logic.
router.post('/:ref/device', requirePartnerKey, async (req: Request, res: Response): Promise<void> => {
  const refStr = Array.isArray(req.params.ref) ? req.params.ref[0] : req.params.ref;
  const parsed = DeviceContextSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid device context', details: parsed.error.flatten() }); return; }

  const session = await prisma.session.findUnique({ where: { sessionRef: refStr } });
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  // Enforce tenant isolation when partner key present
  const reqAny = req as any;
  if (reqAny.partner && reqAny.partner.clientId && reqAny.partner.clientId !== session.clientId) {
    res.status(403).json({ error: 'Partner mismatch for session' });
    return;
  }

  try {
    const created = await prisma.deviceContext.upsert({
      where: { sessionId: session.id },
      create: { sessionId: session.id, ...parsed.data },
      update: parsed.data,
    });

    await prisma.sessionEvent.create({
      data: { sessionId: session.id, type: 'device.context_saved', payload: parsed.data },
    });

    res.json({ ok: true, deviceContextId: created.id });
  } catch (err) {
    console.error('[DeviceContext] persist error', err);
    res.status(500).json({ error: 'Failed to persist device context' });
  }
});

export default router;
