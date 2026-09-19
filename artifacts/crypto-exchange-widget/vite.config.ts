import path from 'path';
import { execFileSync } from 'node:child_process';
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

function sourceCommit() {
  const configured = process.env.APP_COMMIT || process.env.REPLIT_GIT_COMMIT || process.env.GIT_COMMIT;
  if (configured?.trim()) return configured.trim();
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: path.resolve(import.meta.dirname, '../..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig(async ({ mode }) => {
  const commit = sourceCommit();
  const deployedAt = process.env.DEPLOYED_AT?.trim() || new Date().toISOString();
  const buildId = process.env.APP_BUILD_ID?.trim()
    || `${commit.slice(0, 12)}-${deployedAt.replace(/\D/g, '').slice(0, 14)}`;

  return {
  base: basePath,
  define: {
    'import.meta.env.APP_BUILD_ID': JSON.stringify(buildId),
    'import.meta.env.APP_COMMIT': JSON.stringify(commit),
    'import.meta.env.DEPLOYED_AT': JSON.stringify(deployedAt),
  },
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
  };
});
