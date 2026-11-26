import type { NextConfig } from 'next';

const config: NextConfig = {
  // The SDK ships TypeScript source and imports siblings with explicit .ts extensions.
  transpilePackages: ['@fundilink/sdk'],
  webpack(cfg) {
    cfg.resolve.extensionAlias = { ...(cfg.resolve.extensionAlias ?? {}), '.js': ['.ts', '.tsx', '.js'] };
    return cfg;
  },
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
  poweredByHeader: false,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
    async headers() {
    return [{ source: '/:section(app|professional|admin|enterprise|auth|login|register)/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }] }];
  },
};
export default config;
