import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { config } from '../config';

const router = Router();

const MeasurementSchema = z.object({
  heightCm:             z.number().positive().optional(),
  headCircumferenceCm:  z.number().positive().optional(),
  neckCircumferenceCm:  z.number().positive().optional(),
  shoulderWidthCm:      z.number().positive().optional(),
  chestGirthCm:         z.number().positive().optional(),
  waistGirthCm:         z.number().positive().optional(),
  hipGirthCm:           z.number().positive().optional(),
  torsoLengthCm:        z.number().positive().optional(),
  sleeveLengthCm:       z.number().positive().optional(),
  trouserLengthCm:      z.number().positive().optional(),
  skirtLengthCm:        z.number().positive().optional(),
  suggestedSize:        z.string().optional(),
  overallConfidence:    z.number().min(0).max(1).optional(),
  stabilityScore:       z.number().min(0).max(1).optional(),
  framesAnalyzed:       z.number().int().positive().optional(),
  qualityGrade:         z.enum(['good', 'fair', 'poor']).optional(),
  processingDurationMs: z.number().int().positive().optional(),
});

// ─── POST /api/sessions/:ref/measurements ─────────────────────────────────────
router.post('/:ref/measurements', async (req: Request, res: Response): Promise<void> => {
  const refStr = Array.isArray(req.params.ref) ? req.params.ref[0] : req.params.ref;
  const session = await prisma.session.findUnique({
    where: { sessionRef: refStr },
    include: { partner: { select: { clientId: true } } },
  });
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
  if (session.status === 'COMPLETE') { res.status(409).json({ error: 'Session already completed' }); return; }

  const parsed = MeasurementSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid measurement data', details: parsed.error.flatten() });
    return;
  }

  const data = parsed.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawDataPayload: any = req.body.rawData ?? null;

  const [measurement] = await prisma.$transaction([
    prisma.measurement.create({
      data: {
        sessionId: session.id,
        engineVersion: config.measurementEngineVersion,
        ...data,
        isSaved: true,
        rawData: rawDataPayload,
      },
    }),
    prisma.session.update({
      where: { id: session.id },
      data: { status: 'COMPLETE', completedAt: new Date() },
    }),
  ]);

  // Clean Partner Payload (e.g. for SewMyWears) — excludes internal telemetry
  const partnerPayload = buildCleanPartnerPayload(measurement);

  // Digitcan Internal Record — complete telemetry for analytics
  const internalRecord = buildDigitcanInternalRecord(session, measurement);

  firePartnerWebhook(session.clientId, partnerPayload).catch(() => { /* silent */ });

  res.status(201).json({
    result: partnerPayload,
    internalRecord, // Internal audit reference
  });
});

// ─── POST /api/sessions/:ref/telemetry ─────────────────────────────────────────
// Internal Digitcan operational & analytics telemetry endpoint
router.post('/:ref/telemetry', async (req: Request, res: Response): Promise<void> => {
  const refStr = Array.isArray(req.params.ref) ? req.params.ref[0] : req.params.ref;
  const { event } = req.body;

  const session = await prisma.session.findUnique({ where: { sessionRef: refStr } });
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  if (event === 'measurements_copied') {
    const latestMeasurement = await prisma.measurement.findFirst({
      where: { sessionId: session.id },
      orderBy: { capturedAt: 'desc' },
    });

    if (latestMeasurement) {
      await prisma.measurement.update({
        where: { id: latestMeasurement.id },
        data: { isCopied: true, copiedAt: new Date() },
      });
    }
  }

  res.status(200).json({ ok: true, event, sessionRef: refStr });
});

// ─── GET /api/sessions/:ref/measurements ──────────────────────────────────────
router.get('/:ref/measurements', async (req: Request, res: Response): Promise<void> => {
  const refStr = Array.isArray(req.params.ref) ? req.params.ref[0] : req.params.ref;
  const session = await prisma.session.findUnique({
    where: { sessionRef: refStr },
    include: { measurements: { orderBy: { capturedAt: 'desc' }, take: 1 } },
  });

  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  if (session.status !== 'COMPLETE' || !session.measurements[0]) {
    res.status(404).json({ error: 'No completed measurements for this session', status: session.status });
    return;
  }

  // Returns clean partner payload for client consumption
  res.json({ result: buildCleanPartnerPayload(session.measurements[0]) });
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds clean client/partner payload containing ONLY requested measurements and unit.
 * Strips internal telemetry, engine versions, frame counts, confidence scores, and IDs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildCleanPartnerPayload(m: any) {
  const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? Math.round(v * 10) / 10 : null);

  return {
    measurements: {
      height:   num(m.heightCm),
      head:     num(m.headCircumferenceCm),
      neck:     num(m.neckCircumferenceCm),
      shoulder: num(m.shoulderWidthCm),
      chest:    num(m.chestGirthCm),
      waist:    num(m.waistGirthCm),
      hip:      num(m.hipGirthCm),
      torso:    num(m.torsoLengthCm),
      sleeve:   num(m.sleeveLengthCm),
      trouser:  num(m.trouserLengthCm),
      skirt:    num(m.skirtLengthCm),
    },
    unit: 'cm',
    suggestedSize: m.suggestedSize ?? null,
  };
}

/**
 * Digitcan Internal Record — complete telemetry & operational audit
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildDigitcanInternalRecord(
  session: { sessionRef: string; clientId: string; customerId: string | null; createdAt: Date; partner?: { clientId: string } },
  m: any
) {
  return {
    sessionRef:           session.sessionRef,
    clientId:             session.partner?.clientId ?? session.clientId,
    customerId:           session.customerId,
    status:               'COMPLETE',
    engineVersion:        m.engineVersion,
    overallConfidence:    m.overallConfidence,
    stabilityScore:       m.stabilityScore,
    framesAnalyzed:       m.framesAnalyzed,
    qualityGrade:         m.qualityGrade,
    isSaved:              m.isSaved,
    isCopied:             m.isCopied,
    copiedAt:             m.copiedAt,
    processingDurationMs: m.processingDurationMs,
    startedAt:            session.createdAt,
    completedAt:          m.capturedAt,
  };
}

async function firePartnerWebhook(partnerIdOrClientId: string, payload: unknown) {
  const partner = await prisma.partner.findFirst({
    where: {
      OR: [
        { id: partnerIdOrClientId },
        { clientId: partnerIdOrClientId },
      ],
    },
    select: { webhookUrl: true },
  });
  if (!partner?.webhookUrl) return;
  await fetch(partner.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'measurement.complete', data: payload }),
    signal: AbortSignal.timeout(10_000),
  });
}

export default router;
