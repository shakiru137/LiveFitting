import 'dotenv/config';
import express from 'express';
import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { dynamicCors } from './middleware/cors';
import sessionsRouter from './routes/sessions';
import measurementsRouter from './routes/measurements';
import partnersRouter from './routes/partners';
import { config } from './config';

const app = express();

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Managed separately for the iframe embedding use-case
  crossOriginOpenerPolicy: false,
}));
app.use(dynamicCors());
app.options('*', dynamicCors()); // Pre-flight

// ─── Rate Limiting ─────────────────────────────────────────────────────────────
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
}));

// ─── Body Parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Trust proxy (Render adds X-Forwarded-For) ────────────────────────────────
app.set('trust proxy', 1);

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/sessions', sessionsRouter);
app.use('/api/sessions', measurementsRouter);   // /api/sessions/:ref/measurements
app.use('/api/partners', partnersRouter);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: config.measurementEngineVersion, env: config.nodeEnv });
});

// ─── Serve Static Frontend (Production Only) ──────────────────────────────────
// In production, Express serves the Vite-built React app.
// In development, Vite dev server runs separately on port 5173 with proxy to this server.
if (!config.isDev) {
  const distPath = path.resolve(__dirname, '../../dist');
  app.use(express.static(distPath, {
    setHeaders(res, filePath) {
      // Cache hashed assets aggressively; HTML never cached
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));

  // SPA fallback — all non-API routes serve index.html
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ─── Error Handler ─────────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`\n🚀 LiveFittingRoom Server`);
  console.log(`   Environment : ${config.nodeEnv}`);
  console.log(`   Port        : ${config.port}`);
  console.log(`   Engine v    : ${config.measurementEngineVersion}`);
  if (config.isDev) console.log(`   Frontend    : http://localhost:5173 (Vite dev server)`);
});

export default app;
