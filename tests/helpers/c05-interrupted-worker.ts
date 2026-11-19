// Disposable DB only. Record an actual fake-provider charge, then leave the call pending
// so the parent can kill this OS process before its receipt reaches the ledger.
import { appendFile } from 'node:fs/promises';
import { execute } from '../../apps/api/src/infrastructure/execution/broker';
const url = new URL(process.env.DATABASE_URL!);
if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('_test'))
  throw Error('local test DB required');
void execute(process.argv[2], {
  async invoke(job) {
    await appendFile(process.argv[3], job.id + '\n');
    process.send?.('charged');
    return new Promise(() => {});
  }
}).catch(() => process.exit(2));
