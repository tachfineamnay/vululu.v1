/**
 * Preuve S3 preproduction : upload, URL signee, integrite SHA-256 et lecture Range.
 * Non destructif : ecrit un objet de preuve sous preprod-proof/ et le laisse.
 * Variables : S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID,
 * S3_SECRET_ACCESS_KEY, S3_FORCE_PATH_STYLE, NODE_EXTRA_CA_CERTS.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import { S3CompatibleArtifactStorage } from '../../apps/api/src/infrastructure/storage/s3ArtifactStorage';

function sha256(content: Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function fetchUrl(url: string, caPath: string): Promise<{ status: number; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { ca: fs.readFileSync(caPath) }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks) }));
    });
    request.on('error', reject);
    request.setTimeout(15000, () => request.destroy(new Error('timeout')));
  });
}

async function main(): Promise<void> {
  const caPath = process.env.NODE_EXTRA_CA_CERTS;
  if (!caPath || !fs.existsSync(caPath)) {
    throw new Error('NODE_EXTRA_CA_CERTS manquant.');
  }
  const storage = new S3CompatibleArtifactStorage({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || 'us-east-1',
    bucket: process.env.S3_BUCKET || '',
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE || 'true') !== 'false',
    timeoutMs: 20000,
    maxAttempts: 2
  });
  const stamp = Date.now();
  const key = 'preprod-proof/presign-' + stamp + '.txt';
  const content = Buffer.from('vululu-preprod-presign-' + stamp);
  const checksum = sha256(content);
  const put = await storage.putObject({ key, body: content, contentType: 'text/plain', sha256: checksum, sizeBytes: content.length });
  console.log('PRESIGN_PUT PASS key=' + put.key + ' bytes=' + put.sizeBytes);

  const verified = await storage.verify(key, checksum);
  console.log('PRESIGN_VERIFY ' + (verified ? 'PASS' : 'FAIL'));

  const signed = await storage.getSignedReadUrl(key, 120);
  if (!signed) throw new Error('URL signee absente.');
  const fetched = await fetchUrl(signed, caPath);
  const fetchedSha = sha256(fetched.body);
  console.log('PRESIGN_SIGNED_URL ' + (fetched.status === 200 && fetchedSha === checksum ? 'PASS' : 'FAIL') + ' status=' + fetched.status + ' sha_match=' + (fetchedSha === checksum));

  const range = await storage.get(key, { start: 0, end: 9 });
  const rangeChunks: Buffer[] = [];
  for await (const chunk of range.stream) rangeChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const rangeBody = Buffer.concat(rangeChunks);
  console.log('PRESIGN_RANGE ' + (rangeBody.length === 10 ? 'PASS' : 'FAIL') + ' bytes=' + rangeBody.length);
  if (!verified || fetched.status !== 200 || fetchedSha !== checksum || rangeBody.length !== 10) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('PRESIGN_S3_FAIL', error instanceof Error ? error.message : error);
  process.exit(1);
});
