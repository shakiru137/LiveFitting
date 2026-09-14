import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

export const config = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isDev: (process.env.NODE_ENV ?? 'development') === 'development',

  jwtSecret: required('JWT_SECRET'),
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10),

  adminKey: required('DIGITCAN_ADMIN_KEY'),

  devAllowedOrigins: (process.env.DEV_ALLOWED_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim()),

  measurementEngineVersion: process.env.MEASUREMENT_ENGINE_VERSION ?? '1.0.0',

  sessionTtlHours: 2,
};
