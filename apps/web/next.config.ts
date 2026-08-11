import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The shared package ships raw TypeScript so mobile and web consume one source of
  // truth without a build step in between.
  transpilePackages: ['@vela/shared'],
};

export default nextConfig;
