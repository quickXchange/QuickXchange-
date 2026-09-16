import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5173;

if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || '/';

export default defineConfig(async ({ mode }) => ({
  base: basePath,
  plugins: [
    react(),
    tailwindcss({ optimize: mode === 'production' }),
    ...(mode !== 'production' ? [runtimeErrorOverlay()] : []),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: [
      ...(mode === 'e2e'
        ? [
            {
              find: /^@clerk\/react(?:\/internal)?$/,
              replacement: path.resolve(
                import.meta.dirname,
                'test/clerk-stub.tsx',
              ),
            },
            {
              find: /^@clerk\/themes$/,
              replacement: path.resolve(
                import.meta.dirname,
                'test/clerk-stub.tsx',
              ),
            },
          ]
        : []),
      {
        find: '@',
        replacement: path.resolve(import.meta.dirname, 'src'),
      },
      {
        find: '@assets',
        replacement: path.resolve(
          import.meta.dirname,
          '..',
          '..',
          'attached_assets',
        ),
      },
    ],
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      'react',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom',
      'react-dom/client',
    ],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/@clerk/')) return 'clerk';
          if (id.includes('/node_modules/clsx/')) return 'clsx';
          if (
            id.includes('/node_modules/recharts/') ||
            id.includes('/node_modules/d3-')
          ) return 'charts';
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
}));
