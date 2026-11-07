import { expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.APP_ENV = 'test'; process.env.V0_TEST_DB = '1';
  process.env.DATABASE_URL_TEST = 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public';
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST; process.env.SESSION_SECRET = globalThis.crypto.randomUUID();
});
import { DomainError } from '../../packages/domain/src';
import { messageInputSchema } from '@vululu/contracts';
import { buildServer } from '../../apps/api/src/server';
import { ApplicationError } from '@vululu/application';

it('journalise le statut et le code effectivement envoyes pour les validations domaine et contrat', async () => {
  const app = await buildServer();
  app.get('/fixture-domain-error', async () => { throw new DomainError('invalid_input', 'Fixture de validation.'); });
  app.get('/fixture-contract-error', async () => messageInputSchema.parse({}));
  app.get('/fixture-unknown-error', async () => { throw Object.assign(new Error('Fixture interne.'), { statusCode: 502, code: 'downstream_fixture' }); });
  app.get('/fixture-application-error', async () => { throw new ApplicationError('fixture_unavailable', 'Fixture indisponible.', 503); });
  const lines: string[] = [];
  const output = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => { lines.push(String(chunk)); return true; });
  try {
    const domain = await app.inject({ method: 'GET', url: '/fixture-domain-error' });
    const contract = await app.inject({ method: 'GET', url: '/fixture-contract-error' });
    expect(domain.statusCode).toBe(400); expect(contract.statusCode).toBe(400);
    const unknown = await app.inject({ method: 'GET', url: '/fixture-unknown-error' });
    const application = await app.inject({ method: 'GET', url: '/fixture-application-error' });
    expect(unknown.statusCode).toBe(500); expect(application.statusCode).toBe(503);
    const events = lines.filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));
    const failures = events.filter((event) => event.event === 'http.request.failed');
    expect(failures.map((event) => ({ statusCode: event.statusCode, errorCode: event.errorCode }))).toEqual([{ statusCode: 400, errorCode: 'domain_validation' }, { statusCode: 400, errorCode: 'validation_error' }, { statusCode: 500, errorCode: 'internal_error' }, { statusCode: 503, errorCode: 'fixture_unavailable' }]);
    expect(events.filter((event) => event.event === 'http.request.completed').map((event) => event.statusCode)).toEqual([400, 400, 500, 503]);
  } finally { output.mockRestore(); await app.close(); }
});
