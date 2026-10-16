import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Static brand assets only; Cloudflare Workers has no built-in image optimizer.
    unoptimized: true,
  },
  experimental: {
    // Vaultium uploads (up to 5 files × 5 MB) and App Store releases go through Server Actions.
    serverActions: { bodySizeLimit: '120mb' },
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Private documents must never be cached by shared caches.
      { source: '/api/files/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] },
    ];
  },
  async redirects() {
    return [
      // Legacy asset paths used by installed PWAs and printed material.
      { source: '/assets/site.webmanifest', destination: '/manifest.webmanifest', permanent: true },
      { source: '/assets/favicon.ico', destination: '/favicon.ico', permanent: true },
      { source: '/assets/favicon.svg', destination: '/icon.svg', permanent: true },
      { source: '/assets/apple-touch-icon.png', destination: '/apple-icon.png', permanent: true },
    ];
  },
};

export default nextConfig;

// Enables Cloudflare bindings (D1, R2, Workers AI) during `next dev`.
// Only runs in development; production uses the OpenNext worker.
if (process.env.NODE_ENV === 'development' && process.env.EMS_CF_DEV !== '0') {
  import('@opennextjs/cloudflare')
    .then(({ initOpenNextCloudflareForDev }) => initOpenNextCloudflareForDev())
    .catch(() => {
      /* Bindings unavailable — the app falls back to process.env (e.g. Supabase). */
    });
}
