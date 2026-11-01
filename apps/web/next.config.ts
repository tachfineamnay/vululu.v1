import type { NextConfig } from 'next';

const apiInternalUrl = (process.env.API_INTERNAL_URL || 'http://127.0.0.1:3101').replace(/\/+$/, '');

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: apiInternalUrl + '/api/:path*'
      }
    ];
  }
};

export default nextConfig;