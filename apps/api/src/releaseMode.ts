import { HttpError } from './errors';
export const demoDisabled = () =>
  (process.env.APP_ENV === 'production' || (process.env.NODE_ENV === 'production' && !process.env.APP_ENV)) &&
  process.env.DEMO_MODE !== '1';
export async function requireDemo() {
  if (demoDisabled())
    throw new HttpError(404, 'demo_disabled', 'Cette opération de démonstration n’est pas disponible.');
}
