import type { NextConfig } from 'next';

/**
 * Le proxy /api est un route handler runtime (app/api/[...path]/route.ts) :
 * API_INTERNAL_URL est lu a la requete, pas fige au build.
 *
 * ALLOWED_DEV_ORIGINS (liste separee par des virgules) permet d'autoriser un
 * hote de developpement supplementaire (previsualisation distante, tunnel) sans
 * modifier la configuration locale par defaut. Sans effet en production.
 */
const extraDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1', 'localhost', ...extraDevOrigins]
};

export default nextConfig;
