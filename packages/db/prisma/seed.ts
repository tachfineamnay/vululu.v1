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

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, name: 'Bootstrap Super Admin', role: 'super_admin' }
  });

  if (user.role !== 'super_admin') throw new Error('Le compte existant ne peut pas être élevé par bootstrap.');
  console.log('Bootstrap super_admin disponible ; comptes existants inchangés.');
}

main()
  .catch(() => {
    console.error('Bootstrap administrateur impossible : vérifier la configuration et le rôle du compte existant.');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
