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
};
export default config;
