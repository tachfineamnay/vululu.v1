import './env';
import { env } from './env';
import { buildServer } from './server';

const app = await buildServer();

await app.listen({ port: env.port, host: '127.0.0.1' });

console.log('Vululu API demarree sur http://127.0.0.1:' + env.port);
