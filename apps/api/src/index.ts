import './env';
import { env } from './env';
import { buildServer } from './server';

const app = await buildServer();

if (env.orchestratorMode === 'hatchet') {
  const { outboxDispatcher } = await import('./application/container');
  if (outboxDispatcher) {
    await outboxDispatcher.recoverStaleClaims(0);
    await outboxDispatcher.reconcileApprovals();
    outboxDispatcher.start();
  }
}

await app.listen({ port: env.port, host: '127.0.0.1' });

console.log('Vululu API demarree sur http://127.0.0.1:' + env.port);