/** Disposable PG verification. Requires pg (test driver only); no production configuration. */
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { Client } = createRequire(import.meta.url)('pg');
const url = new URL(process.env.DATABASE_URL_TEST);
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.endsWith('_test'))
  throw new Error('Local disposable test DB required');
const db = new Client({ connectionString: url.href });
await db.connect();
try {
  await db.query('BEGIN');
  const schema = 'c03_' + randomBytes(6).toString('hex');
  await db.query(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema}`);
  const root = 'packages/db/prisma/migrations/',
    target = '20261119200000_creative_revisions';
  const apply = async (d) =>
    db.query((await readFile(root + d + '/migration.sql', 'utf8')).replace(/^\uFEFF/, ''));
  for (const d of (await readdir(root)).filter((x) => x < target).sort()) await apply(d);
  await db.query(`INSERT INTO "User"(id,email,name,"passwordHash") VALUES ('owner','test@example.test','Test','unused');
    INSERT INTO "BrandContext"(id,"userId",name,description,"updatedAt") VALUES ('brand','owner','Marque','Test',now());
    INSERT INTO "Campaign"(id,"userId",name) VALUES ('campaign','owner','Collection');
    INSERT INTO "Project"(id,"userId","contextId","campaignId",title,platform,format,objective,"updatedAt") VALUES ('project','owner','brand','campaign','Test','Instagram','Video','Test',now());
    INSERT INTO "Artifact"(id,"projectId",kind) VALUES ('art','project','master');
    INSERT INTO "ArtifactVersion"(id,"artifactId",version,"masterPath",checksum) VALUES ('v1','art',1,'existing.mp4','existing-checksum');
    INSERT INTO "Approval"(id,"artifactVersionId","approvedBy",checksum) VALUES ('approval','v1','owner','existing-checksum');
    INSERT INTO "ConfirmedOffer"(id,"contextId",name) VALUES ('offer','brand','Cours');
    INSERT INTO "ContentItem"(id,"userId","offerId","campaignId","projectId",title,audience,objective,status,"plannedAt","timeZone",variants,version) VALUES ('item','owner','offer','campaign','project','Test','Public','Test','IDEA',now(),'UTC','[]',1)`);
  const snapshot = async () => {
    const rows = [];
    for (const table of [
      'Project',
      'Approval',
      'ArtifactVersion',
      'ConfirmedOffer',
      'ContentItem',
      'Campaign',
      'BrandContext'
    ])
      rows.push((await db.query(`SELECT * FROM "${table}" ORDER BY id`)).rows);
    return rows;
  };
  const before = await snapshot();
  await apply(target);
  assert.deepEqual(await snapshot(), before);
  assert.equal((await db.query('SELECT count(*) FROM "CreativeRevision"')).rows[0].count, '0');
  console.log('PASS: additive C03 upgrade, seven pre-existing record sets unchanged.');
} finally {
  await db.query('ROLLBACK');
  await db.end();
}
