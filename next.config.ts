import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // A lockfile in the parent directory makes Next infer the wrong workspace
  // root and scan (and recompile against) an unrelated tree.
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=()',
          },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
        ],
      },
    ]
  },
}

export default nextConfig
