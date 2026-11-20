import { unlink, rmdir } from 'node:fs/promises';
import { dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';

export default async function teardown() {
  const mailbox = process.env.F01_TEST_MAILBOX;
  if (!mailbox) return;
  const directory = dirname(mailbox);
  if (dirname(directory) !== tmpdir() || !basename(directory).startsWith('vululu-f01-') || basename(mailbox) !== 'mail.ndjson') return;
  await unlink(mailbox).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
  await rmdir(directory);
}
