/**
 * Seed a default "digitcan" partner for the hosted demo/testing.
 * Run with: npm run db:seed
 */
import { prisma } from '../db';
import bcrypt from 'bcrypt';
import { config } from '../config';

async function seed() {
  console.log('🌱  Seeding database...');

  // Digitcan internal demo partner
  const digitcanSecret = process.env.DIGITCAN_DEMO_SECRET ?? 'digitcan-demo-secret-change-this';
  const hash = await bcrypt.hash(digitcanSecret, config.bcryptRounds);

  await prisma.partner.upsert({
    where: { clientId: 'digitcan' },
    create: {
      clientId: 'digitcan',
      name: 'Digitcan Demo',
      secretKeyHash: hash,
      allowedOrigins: [
        'http://localhost:5173',
        'http://localhost:3001',
        'https://app.digitcan.com',
        'https://digitcan.com',
      ],
      isActive: true,
    },
    update: { secretKeyHash: hash },
  });

  console.log('✅  Seeded "digitcan" partner');

  // SewMyWears partner (placeholder — they'll receive a real API key separately)
  const sewSecret = process.env.SEWMYWEARS_SECRET ?? 'sewmywears-secret-change-this';
  const sewHash = await bcrypt.hash(sewSecret, config.bcryptRounds);

  await prisma.partner.upsert({
    where: { clientId: 'sewmywears' },
    create: {
      clientId: 'sewmywears',
      name: 'SewMyWears',
      secretKeyHash: sewHash,
      allowedOrigins: [
        'https://sewmywears.com',
        'https://www.sewmywears.com',
        'https://app.sewmywears.com',
      ],
      isActive: true,
    },
    update: { secretKeyHash: sewHash },
  });

  console.log('✅  Seeded "sewmywears" partner');
  await prisma.$disconnect();
}

seed().catch((err) => {
  console.error('❌  Seed failed:', err);
  process.exit(1);
});
