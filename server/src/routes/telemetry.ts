import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requirePartnerKey } from '../middleware/partnerAuth';

const router = Router();

const TelemetrySchema = z.object({
  event: z.string(),
  meta: z.record(z.unknown()).optional(),
});

const ALLOWED_EVENTS = new Set([
  'camera_permission_requested',
  'camera_permission_granted',
  'camera_permission_denied',
  'camera_initialized',
  'camera_failed',
  'tracking_started',
  'body_detected',
  'body_lost',
  'pose_valid',
  'pose_invalid',
  'measurement_started',
  'measurement_candidate_generated',
  'measurement_window_started',
  'measurement_window_rejected',
  'measurement_window_accepted',
  'measurement_completed',
  'save_started',
  'save_succeeded',
  'save_failed',
  'measurements_copied',
  'session_abandoned',
]);

// POST /api/sessions/:ref/telemetry
// Accepts telemetry events from client (browser) or partner server (server-to-server).
// For non-origin/server-to-server flows we require partner API key middleware to attach req.partner.
router.post('/:ref/telemetry', requirePartnerKey, async (req: Request, res: Response): Promise<void> => {
  const refStr = Array.isArray(req.params.ref) ? req.params.ref[0] : req.params.ref;
  const parsed = TelemetrySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid telemetry payload', details: parsed.error.flatten() });
    return;
  }

  const { event, meta } = parsed.data;
  if (!ALLOWED_EVENTS.has(event)) {
    res.status(400).json({ error: 'Event not allowed' });
    return;
  }

  const session = await prisma.session.findUnique({ where: { sessionRef: refStr } });
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  // If requirePartnerKey attached req.partner, enforce tenant isolation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reqAny = req as any;
  if (reqAny.partner && reqAny.partner.clientId && reqAny.partner.clientId !== session.clientId) {
    res.status(403).json({ error: 'Partner mismatch for session' });
    return;
  }

  // Persist event as SessionEvent (payload limited to meta — no raw frames)
  try {
    await prisma.sessionEvent.create({
      data: {
        sessionId: session.id,
        type: event,
        payload: meta ?? {},
      },
    });
  } catch (err) {
    console.error('[Telemetry] Failed to persist session event:', err);
    // don't fail the client for persistence errors — return 202
    res.status(202).json({ ok: true, persisted: false });
    return;
  }

  // Update session timing fields for certain events (best-effort)
  try {
    const updates: Record<string, any> = {};
    const now = new Date();
    switch (event) {
      case 'camera_permission_requested': updates.cameraRequestedAt = now; break;
      case 'camera_permission_granted': updates.cameraGrantedAt = now; break;
      case 'body_detected': if (!session.firstBodyDetectedAt) updates.firstBodyDetectedAt = now; break;
      case 'pose_valid': if (!session.firstValidPoseAt) updates.firstValidPoseAt = now; break;
      case 'measurement_started': updates.measurementStartedAt = now; break;
      case 'measurement_completed': updates.measurementCompletedAt = now; break;
      case 'measurements_copied': /* handled elsewhere in measurements */ break;
    }
    if (Object.keys(updates).length > 0) {
      await prisma.session.update({ where: { id: session.id }, data: updates });
    }
  } catch (err) {
    console.error('[Telemetry] Failed to update session timing fields:', err);
  }

  res.status(200).json({ ok: true, event, sessionRef: refStr });
});

export default router;
