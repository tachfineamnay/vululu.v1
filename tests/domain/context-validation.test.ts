import { expect, it } from 'vitest';
import { createBrandContext } from '../../packages/domain/src/index';

const input = { id: 'context', userId: 'owner', name: 'Fixture', description: 'Description saisie' };
it.each([{ name: 'x'.repeat(161) }, { description: 'x'.repeat(8001) }, { website: 'x'.repeat(2049) }, { audience: 'x'.repeat(2001) }, { tone: 'x'.repeat(1001) }, { colorPrimary: 'url(https://example.test/tracker)' }, { colorSecondary: 'red' }])('borne les donnees et refuse une couleur active (cas %#)', (values) => {
  expect(() => createBrandContext({ ...input, ...values })).toThrow();
});
