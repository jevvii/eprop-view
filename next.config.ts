import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // onnxruntime-node ships a native .node binary; bundling it breaks the
  // dynamic require, so it is loaded from node_modules at run time.
  serverExternalPackages: ['onnxruntime-node'],
  // The fitted detector is a binary asset, not an import. Only the saved-photo
  // review route can invoke it, so trace the artifact and the Linux x64 ONNX
  // runtime into that route only. A global key would push unrelated functions
  // over Vercel's 250 MB uncompressed limit.
  outputFileTracingIncludes: {
    '/document': [
      'src/app/lib/ai/models/**/*',
      'node_modules/onnxruntime-node/bin/napi-v6/linux/x64/**/*',
    ],
  },
  // Existing snapshot validation caps decoded evidence at 8 MB (base64 adds 1/3).
  experimental: { serverActions: { bodySizeLimit: '12mb' } },
  // Exposed so the AR device panel can prove which deployment a phone is
  // actually running; a stale cached build makes every other observation lie.
  env: {
    NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
  },
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
