import type { NextConfig } from 'next';

/**
 * Le proxy /api est un route handler runtime (app/api/[...path]/route.ts) :
 * API_INTERNAL_URL est lu a la requete, pas fige au build.
 */
const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1', 'localhost']
};

export default nextConfig;
