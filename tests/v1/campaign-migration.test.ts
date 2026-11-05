import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@vululu/db';
import { expect, it } from 'vitest';

it.each([{ migration: '20261104174000_v1_demo_campaigns', count: 12 }, { migration: '20261104190000_v1_demo_assets', count: 13 }, { migration: '20261104214500_v1_demo_brief_profiles', count: 14 }, { migration: '20261104221500_v1_demo_storyboard_binding', count: 15 }, { migration: '20261105094500_v1_demo_conversation_proposals', count: 16 }, { migration: '20261105101500_v1_demo_scene_duration_origin', count: 17 }])('migre les $count versions precedentes sans perdre projet ni snapshot existants', async ({ migration, count }) => {
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
    await client.$executeRaw`INSERT INTO "Brief" (id,"projectId",objective,audience,tone,cta,platform,format,version,"updatedAt") VALUES ('upgrade-brief','upgrade-project','Objectif historique','Audience','Ton','CTA','Instagram','Video',3,NOW())`;
    await client.$executeRaw`INSERT INTO "BriefRevision" (id,"briefId",version,objective,audience,tone,cta,platform,format,checksum) VALUES ('upgrade-brief-revision','upgrade-brief',3,'Objectif historique','Audience','Ton','CTA','Instagram','Video','historical-checksum-to-preserve')`;
    const previousBrief = await client.$queryRaw<object[]>`SELECT * FROM "BriefRevision" WHERE id = 'upgrade-brief-revision'`;
    await client.$executeRaw`INSERT INTO "Message" (id,"projectId",role,content) VALUES ('upgrade-message','upgrade-project','assistant','Message historique de fixture')`;
    const previousMessage = await client.$queryRaw<object[]>`SELECT * FROM "Message" WHERE id = 'upgrade-message'`;
    await client.$executeRaw`INSERT INTO "Scene" (id,"projectId","sceneKey",position,title,description,"durationSeconds") VALUES ('upgrade-scene','upgrade-project','SCENE-003',3,'Historique','Valeur à conserver',7)`;
    const previousScene = await client.$queryRaw<object[]>`SELECT * FROM "Scene" WHERE id = 'upgrade-scene'`;
    const snapshot = JSON.stringify({ fixture: 'before-campaign' });
    const checksum = crypto.createHash('sha256').update(snapshot).digest('hex');
    await client.$executeRaw`INSERT INTO "JobRun" (id,"projectId",type,status,snapshot,"snapshotChecksum","updatedAt") VALUES ('upgrade-run','upgrade-project','produce','awaiting_review',${snapshot}::jsonb,${checksum},NOW())`;
    const before = await client.$queryRaw<object[]>`SELECT * FROM "JobRun" WHERE id = 'upgrade-run'`;
    deploy(path.join(process.cwd(), 'packages/db/prisma/schema.prisma'));
    const project = await client.project.findUniqueOrThrow({ where: { id: 'upgrade-project' } });
    expect(project).toMatchObject({ title: 'Travail a conserver', status: 'review', contextId: 'upgrade-context', campaignId: null, usage: 'organic', storyboardBriefVersion: null });
    expect(await client.briefRevision.findUniqueOrThrow({ where: { id: 'upgrade-brief-revision' } })).toMatchObject(previousBrief[0]);
    expect(await client.brief.findUniqueOrThrow({ where: { id: 'upgrade-brief' } })).toMatchObject({ version: 3, settings: null, confirmedVersion: null, confirmedChecksum: null });
    expect(await client.message.findUniqueOrThrow({ where: { id: 'upgrade-message' } })).toMatchObject({ ...previousMessage[0], proposal: null });
    expect(await client.scene.findUniqueOrThrow({ where: { id: 'upgrade-scene' } })).toMatchObject({ ...previousScene[0], durationSeconds: 7, usesBriefDuration: null });
    expect(await client.jobRun.findUniqueOrThrow({ where: { id: 'upgrade-run' } })).toMatchObject(before[0]);
    expect(await client.campaign.count()).toBe(0);
    expect(await client.brandAsset.count()).toBe(0);
  } finally {
    // Base et fichiers de preuve gardés dans le cluster jetable ; aucune suppression.
    await client.$disconnect(); await admin.$disconnect();
  }
});
