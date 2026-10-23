import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.V0_DEMO_EMAIL || 'demo@vululu.local';
  const password = process.env.V0_DEMO_PASSWORD || 'vululu-demo';
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, name: 'Demo Vululu' },
    create: { email, passwordHash, name: 'Demo Vululu', role: 'user' }
  });

  console.log('Seeded demo user: ' + email);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
