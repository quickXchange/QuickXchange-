import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';
import { publishedSiteContentStub } from './test/site-content-stub';

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5173;

if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || '/';

export default defineConfig(async ({ mode }) => ({
  base: basePath,
  plugins: [
    ...(mode === 'e2e'
      ? [{
          name: 'e2e-shared-api-defaults',
          configureServer(server) {
            server.middlewares.use((req, res, next) => {
              const requestPath = req.url?.split('?')[0];
              const body = requestPath === '/api/site-content'
                ? publishedSiteContentStub
                : requestPath === '/api/site-navigation'
                  ? []
                  : requestPath === '/api/admin/authorization'
                    ? {
                        member: {
                          id: 'operator-e2e',
                          email: 'operator@example.test',
                          role: 'owner',
                          status: 'active',
                        },
                        owner: true,
                        effectivePermissions: [],
                        catalog: [],
                      }
                    : undefined;
              if (body === undefined) return next();
              res.statusCode = 200;
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify(body));
            });
          },
        }]
      : []),
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
