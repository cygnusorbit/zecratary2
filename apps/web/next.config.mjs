import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cap worker CPU allocation to prevent Hostinger CageFS thread exhaustion (os error 11)
process.env.NEXT_CPU_COUNT = process.env.NEXT_CPU_COUNT || '2';

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},

  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),

  // Unconditionally output standalone server bundle for Hostinger Node.js Web App
  output: 'standalone',
  reactStrictMode: false,
  experimental: {
    cpus: 2,
    workerThreads: false,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'src'),
      '@/components': path.resolve(__dirname, 'src/components'),
      '@/lib': path.resolve(__dirname, 'src/lib'),
      '@/hooks': path.resolve(__dirname, 'src/hooks'),
      '@/types': path.resolve(__dirname, 'src/types'),
      '@/context': path.resolve(__dirname, 'src/components'),
      '@/contexts': path.resolve(__dirname, 'src/components'),
    };
    return config;
  },
};

export default nextConfig;
