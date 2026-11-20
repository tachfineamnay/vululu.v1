import './env';
import { env } from './env';
import { buildServer } from './server';
import { startStudioRenderPump } from './infrastructure/creative/renderJobs';

const app = await buildServer();
if (env.orchestratorMode === 'local') app.addHook('onClose', startStudioRenderPump());

if (env.orchestratorMode === 'hatchet') {
  const { outboxDispatcher } = await import('./application/container');
  if (outboxDispatcher) {
    await outboxDispatcher.recoverStaleClaims(0);
    await outboxDispatcher.reconcileApprovals();
    outboxDispatcher.start();
  }
}

await app.listen({ port: env.port, host: env.host });

console.log('Vululu API demarree sur http://' + env.host + ':' + env.port);