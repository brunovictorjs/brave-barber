import type { NextConfig } from 'next';

const API_URL = process.env.API_URL ?? 'http://localhost:3333';

/**
 * O front conversa com a API pelo mesmo domínio (/api e /uploads são
 * repassados ao NestJS). Assim o cookie de sessão é do próprio site e não há CORS.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_URL}/api/:path*` },
      { source: '/uploads/:path*', destination: `${API_URL}/uploads/:path*` },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
};

export default nextConfig;
