import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@vululu/db';
import { expect, it } from 'vitest';

it.each([{ migration: '20261104174000_v1_demo_campaigns', count: 12 }, { migration: '20261104190000_v1_demo_assets', count: 13 }])('migre les $count versions precedentes sans perdre projet ni snapshot existants', async ({ migration, count }) => {
  const name = 'vululu_campaign_upgrade_' + crypto.randomBytes(6).toString('hex');
  const url = `postgresql://vululu@127.0.0.1:55432/${name}?schema=public`;
  const admin = new PrismaClient({ datasourceUrl: 'postgresql://vululu@127.0.0.1:55432/postgres?schema=public' });
  const client = new PrismaClient({ datasourceUrl: url });
  const root = path.join(process.cwd(), '.v1', name);
  const migrations = path.join(process.cwd(), 'packages/db/prisma/migrations');
  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
  function deploy(schema: string) {
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schema], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
  }
  try {
    // Identifiant construit localement, sans entrée utilisateur ni base existante.
    await admin.$executeRawUnsafe('CREATE DATABASE "' + name + '"');
    fs.mkdirSync(path.join(root, 'migrations'), { recursive: true });
    const previous = fs.readdirSync(migrations, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name < migration);
    expect(previous).toHaveLength(count);
    for (const entry of previous) {
      fs.mkdirSync(path.join(root, 'migrations', entry.name));
      fs.copyFileSync(path.join(migrations, entry.name, 'migration.sql'), path.join(root, 'migrations', entry.name, 'migration.sql'));
    }
    fs.copyFileSync(path.join(migrations, 'migration_lock.toml'), path.join(root, 'migrations', 'migration_lock.toml'));
    const schema = path.join(root, 'schema.prisma');
    fs.writeFileSync(schema, 'datasource db {\n provider = "postgresql"\n url = env("DATABASE_URL")\n}\n');
    deploy(schema);
    await client.$executeRaw`INSERT INTO "User" (id,email,name,"passwordHash") VALUES ('upgrade-user','upgrade@example.test','Fixture upgrade','fixture-only')`;
    await client.$executeRaw`INSERT INTO "BrandContext" (id,"userId",name,description,"updatedAt") VALUES ('upgrade-context','upgrade-user','Marque fictive','Avant migration',NOW())`;
    await client.$executeRaw`INSERT INTO "Project" (id,"userId","contextId",title,platform,format,objective,status,"updatedAt") VALUES ('upgrade-project','upgrade-user','upgrade-context','Travail a conserver','Instagram','Video','Fixture','review',NOW())`;
    const snapshot = JSON.stringify({ fixture: 'before-campaign' });
    const checksum = crypto.createHash('sha256').update(snapshot).digest('hex');
    await client.$executeRaw`INSERT INTO "JobRun" (id,"projectId",type,status,snapshot,"snapshotChecksum","updatedAt") VALUES ('upgrade-run','upgrade-project','produce','awaiting_review',${snapshot}::jsonb,${checksum},NOW())`;
    const before = await client.$queryRaw<object[]>`SELECT * FROM "JobRun" WHERE id = 'upgrade-run'`;
    deploy(path.join(process.cwd(), 'packages/db/prisma/schema.prisma'));
    const project = await client.project.findUniqueOrThrow({ where: { id: 'upgrade-project' } });
    expect(project).toMatchObject({ title: 'Travail a conserver', status: 'review', contextId: 'upgrade-context', campaignId: null, usage: 'organic' });
    expect(await client.jobRun.findUniqueOrThrow({ where: { id: 'upgrade-run' } })).toMatchObject(before[0]);
    expect(await client.campaign.count()).toBe(0);
    expect(await client.brandAsset.count()).toBe(0);
  } finally {
    // Base et fichiers de preuve gardés dans le cluster jetable ; aucune suppression.
    await client.$disconnect(); await admin.$disconnect();
  }
});
