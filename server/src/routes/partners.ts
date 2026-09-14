import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { prisma } from '../db';
import { config } from '../config';
import { requireAdminKey } from '../middleware/auth';

const router = Router();

// All partner management routes require the Digitcan admin key
router.use(requireAdminKey);

const CreatePartnerSchema = z.object({
  clientId: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/, 'clientId must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1).max(128),
  apiSecret: z.string().min(32, 'apiSecret must be at least 32 characters'),
  allowedOrigins: z.array(z.string().url()).min(1),
  webhookUrl: z.string().url().optional(),
});

// ─── POST /api/partners ────────────────────────────────────────────────────────
// Create a new integration partner (SewMyWears, etc.)
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = CreatePartnerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const { clientId, name, apiSecret, allowedOrigins, webhookUrl } = parsed.data;

  const existing = await prisma.partner.findUnique({ where: { clientId } });
  if (existing) {
    res.status(409).json({ error: `Partner with clientId "${clientId}" already exists` });
    return;
  }

  const secretKeyHash = await bcrypt.hash(apiSecret, config.bcryptRounds);
  const partner = await prisma.partner.create({
    data: { clientId, name, secretKeyHash, allowedOrigins, webhookUrl },
    select: { id: true, clientId: true, name: true, allowedOrigins: true, isActive: true, createdAt: true },
  });

  res.status(201).json({ partner, note: 'Store the apiSecret securely — it cannot be retrieved later.' });
});

// ─── GET /api/partners ─────────────────────────────────────────────────────────
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const partners = await prisma.partner.findMany({
    select: {
      id: true, clientId: true, name: true,
      allowedOrigins: true, isActive: true,
      webhookUrl: true, createdAt: true,
      _count: { select: { sessions: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ partners });
});

// ─── PATCH /api/partners/:clientId ────────────────────────────────────────────
router.patch('/:clientId', async (req: Request, res: Response): Promise<void> => {
  const { allowedOrigins, isActive, webhookUrl } = req.body;
  const clientIdStr = Array.isArray(req.params.clientId) ? req.params.clientId[0] : req.params.clientId;
  const updated = await prisma.partner.update({
    where: { clientId: clientIdStr },
    data: { allowedOrigins, isActive, webhookUrl },
    select: { clientId: true, name: true, allowedOrigins: true, isActive: true, updatedAt: true },
  });
  res.json({ partner: updated });
});

export default router;
