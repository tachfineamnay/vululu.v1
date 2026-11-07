import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { prisma } from '@vululu/db';
import { buildServer } from '../../apps/api/src/server';
import { AesProviderCredentialCipher } from '../../apps/api/src/infrastructure/security/providerCredentialCipher';

/** Vérification en lecture des fichiers et clés ; seul le login crée une session. */
async function main() {
  const artifactRoot = path.resolve(process.env.ARTIFACT_DIR || 'data/artifacts');
  const versions = await prisma.artifactVersion.findMany({ include: { artifact: true } });
  if (!versions.length) throw new Error('media_required');
  const scenes = await prisma.sceneVersion.findMany();
  for (const file of [...versions.map((version) => ({ file: version.masterPath, checksum: version.checksum })), ...scenes.map((scene) => ({ file: scene.imagePath, checksum: scene.checksum }))]) {
    const target = path.resolve(artifactRoot, file.file);
    if (!target.startsWith(artifactRoot + path.sep)) throw new Error('artifact_path_invalid');
    const bytes = await fs.readFile(target);
    if (createHash('sha256').update(bytes).digest('hex') !== file.checksum) throw new Error('artifact_checksum_mismatch');
  }
  const cipher = new AesProviderCredentialCipher(); const credentials = await prisma.providerCredential.findMany();
  if (process.argv.includes('--require-credentials') && !credentials.length) throw new Error('credential_fixture_required');
  for (const credential of credentials) if (!cipher.decrypt(credential.encryptedValue, credential.providerId)) throw new Error('credential_empty');
  const user = await prisma.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL || '' } });
  const project = await prisma.project.findFirstOrThrow({ where: { userId: user.id, artifacts: { some: { versions: { some: {} } } } } });
  const owned = versions.filter((version) => version.artifact.projectId === project.id).sort((a, b) => b.version - a.version)[0];
  if (!owned || owned.qaStatus !== 'PASS') throw new Error('master_qa_required');
  const mediaPath = path.resolve(artifactRoot, owned.masterPath);
  const probe = JSON.parse(execFileSync(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', mediaPath], { encoding: 'utf8', windowsHide: true }));
  if (!probe.streams.some((stream: { codec_name: string }) => stream.codec_name === 'h264') || Number(probe.format.duration) <= 0) throw new Error('master_not_readable');
  const app = await buildServer();
  try {
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: user.email, password: process.env.DEMO_PASSWORD || '' } });
    if (login.statusCode !== 200) throw new Error('restored_login_failed');
    const cookie = login.cookies.map((entry) => entry.name + '=' + entry.value).join('; ');
    const response = await app.inject({ method: 'GET', url: `/api/projects/${project.id}/master?version=${owned.version}`, headers: { cookie } });
    if (response.statusCode !== 200 || createHash('sha256').update(response.rawPayload).digest('hex') !== owned.checksum) throw new Error('restored_master_api_failed');
    console.log(JSON.stringify({ mediaVersionsVerified: versions.length, sceneVersionsVerified: scenes.length, credentialsVerified: credentials.length, masterReadViaApi: true }));
  } finally { await app.close(); }
}
main().catch(() => { console.error('Vérification média/restauration en échec ; aucune donnée sensible affichée.'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
