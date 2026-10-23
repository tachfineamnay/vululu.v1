import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.V1_BOOTSTRAP_EMAIL;
  const password = process.env.V1_BOOTSTRAP_PASSWORD;
  if (!email || !password) {
    throw new Error('V1_BOOTSTRAP_EMAIL et V1_BOOTSTRAP_PASSWORD sont obligatoires.');
  }
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, name: 'Bootstrap Super Admin', role: 'super_admin' },
    create: { email, passwordHash, name: 'Bootstrap Super Admin', role: 'super_admin' }
  });

  console.log('Seeded bootstrap super_admin: ' + email);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
