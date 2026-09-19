# Production deployment

This project is a pnpm monorepo with two production outputs:

- `artifacts/api-server/dist/index.mjs`: the Express API process.
- `artifacts/crypto-exchange-widget/dist/public`: static frontend files.

The frontend should be served by a production web server or CDN. Route `/api/*`
to the API process and rewrite other unknown frontend paths to `index.html`.

## Requirements

- Node.js 24
- pnpm 10
- PostgreSQL
- A Clerk application
- A compatible object-storage service

## Install and build

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run build:production
```

`build:production` deletes all deployable `dist` directories before compiling,
builds the main website, Telegram Mini App, and API from the current workspace,
and validates the generated public files. Any missing or inconsistent output
fails the command so publishing cannot silently reuse an older build.

## Database release step

Run migrations before routing production traffic to a new API version:

```sh
pnpm --filter @workspace/db run migrate
```

Migrations require `DATABASE_URL` and `APP_DATABASE_PASSWORD`. Do not use
`drizzle-kit push` in production and do not reorder or edit applied migrations.

## Start

```sh
NODE_ENV=production pnpm run start:production
```

The API listens on `PORT`.

- Use `GET /api/healthz` as the process liveness check.
- Use `GET /api/readyz` as the traffic-readiness check. It returns HTTP 503
  when the API cannot reach PostgreSQL.
- Readiness does not prove that optional external providers are available.
  Verify QuickEx separately with `GET /api/quickex/config`.

## Required environment variables

| Variable | Purpose |
| --- | --- |
| `NODE_ENV=production` | Enables production behavior. |
| `PORT` | API listen port, from 1 through 65535. |
| `DATABASE_URL` | PostgreSQL connection string used at process startup. |
| `APP_DATABASE_PASSWORD` | Password for the restricted `quickex_app_runtime` role. |
| `SESSION_SECRET` | Signs quote and order-tracking capabilities and encrypts provider credentials. |
| `CLERK_PUBLISHABLE_KEY` | Clerk publishable key used by the API. |
| `CLERK_SECRET_KEY` | Clerk server key used by production proxying. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key compiled into the frontend build. |
| `PRIVATE_OBJECT_DIR` | Private object-storage bucket/path prefix. |
| `OBJECT_STORAGE_BACKEND` | Explicit storage adapter: `replit` or `gcs`. |
| `OBJECT_STORAGE_UPLOAD_ORIGINS` | For GCS, comma-separated exact HTTPS frontend origins allowed to upload. |

Set `USE_DATABASE_OWNER=true` only on a managed platform that intentionally
supplies an owner connection. A standard server should omit it and use the
restricted runtime role created by the migrations.

## Provider and operational configuration

- `QUICKEX_PUBLIC_KEY` and `QUICKEX_SECRET_KEY`: required for signed QuickEx
  rates and orders. `QUICKEX_API_KEY` is a legacy account indicator.
- `ONEFORGE_API_KEY`: required for 1Forge fiat rates.
- `OPERATOR_EMAILS`: optional legacy owner bootstrap list.
- `CUSTOMER_NOTIFICATION_FROM_EMAIL`: optional verified sender override.
- `CUSTOMER_NOTIFICATION_POLL_INTERVAL_MS`: optional outbox poll interval.
- `TELEGRAM_BOT_TOKEN`: optional BotFather token. When absent, the Telegram
  webhook and notification worker remain disabled and existing API startup is
  unaffected.
- `TELEGRAM_WEBHOOK_SECRET`: required alongside `TELEGRAM_BOT_TOKEN`; the
  exact secret expected in Telegram's `X-Telegram-Bot-Api-Secret-Token` header.
- `TELEGRAM_WEBSITE_URL`: optional Website button URL shown by the bot.
- `TELEGRAM_SUPPORT_URL`: optional support URL shown by the bot.
- `PUBLIC_SITE_URL`: fallback Website URL when `TELEGRAM_WEBSITE_URL` is absent.
- `TELEGRAM_MINI_APP_URL`: reserved optional Mini App button URL for a future
  Telegram Mini App rollout.

After publishing the API over HTTPS, register the webhook with Telegram using
the configured secret (keep the token and secret out of source control):

```sh
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://YOUR_API_HOST/api/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

The endpoint returns `404` while the bot is disabled, so existing deployments
can roll out this code before Telegram configuration is complete.
- `QUICKEX_BASE_URL`, `QUICKEX_READ_TIMEOUT_MS`,
  `QUICKEX_CREATE_TIMEOUT_MS`, `ONEFORGE_BASE_URL`,
  `COINBASE_USD_RATES_URL`, and `LOG_LEVEL`: optional operational overrides.

## Object storage portability

Set `OBJECT_STORAGE_BACKEND=replit` on Replit. This keeps the existing App
Storage integration and its local credential sidecar. `PRIVATE_OBJECT_DIR`
continues to identify the bucket and private prefix, for example
`/bucket-id/private`.

On a standard server, set `OBJECT_STORAGE_BACKEND=gcs`, set `GCS_PROJECT_ID`,
set `OBJECT_STORAGE_UPLOAD_ORIGINS` to the exact production frontend origin
(or comma-separated origins),
and provide Google Application Default Credentials to the API process (normally
with `GOOGLE_APPLICATION_CREDENTIALS` pointing to a mounted service-account JSON
file). The identity needs permission to read, create, and delete objects and to
sign V4 upload URLs. It also needs permission to read bucket metadata at startup.
The bucket named by `PRIVATE_OBJECT_DIR` must already exist.

Direct browser PUTs require a restrictive bucket CORS policy. Replace the sample
origin below, save it as `cors.json`, and apply it before starting the API:

```json
[
  {
    "origin": ["https://exchange.example.com"],
    "method": ["PUT"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
```

```sh
gcloud storage buckets update gs://YOUR_PRIVATE_BUCKET --cors-file=cors.json
```

Every origin in `OBJECT_STORAGE_UPLOAD_ORIGINS` must have a matching bucket rule.
The API reads bucket metadata during startup and refuses traffic when an origin,
the `PUT` method, or the `Content-Type` response header is missing. This prevents
a deployment from appearing healthy while all Admin browser uploads fail CORS
preflight.

Keep the bucket private: do not enable public access or object ACLs. Browser
uploads use short-lived signed PUT URLs, while reads continue through the API.
The API checks stored content type and size, downloads the complete object, and
fully decodes each image before it is accepted or served. Invalid uploads are
deleted.

## Reverse-proxy example

Configure TLS at the proxy. Serve
`artifacts/crypto-exchange-widget/dist/public` as the document root, proxy
`/api/` to `http://127.0.0.1:$PORT`, and apply an SPA fallback to `index.html`.
Forward the original host and HTTPS scheme so Clerk generates correct URLs.

## Release checklist

1. Install with `pnpm install --frozen-lockfile`.
2. Set all required secrets outside source control.
3. Back up PostgreSQL and run `pnpm --filter @workspace/db run migrate`.
4. Run `pnpm run build:production`.
5. Start the API with `NODE_ENV=production`.
6. Confirm `/api/healthz` and `/api/readyz` return HTTP 200.
7. Confirm `/api/quickex/config` reports signed orders and a non-empty catalog.
8. Confirm public quotes, sign-in, Admin authorization, provider health, object
   uploads, and status tracking on the production hostname.
9. Enable TLS, process supervision, log retention, database backups, and uptime
   monitoring.
10. After Replit Publish/Republish completes, inspect publishing logs, confirm
    the new production build succeeded, and compare the live build identity
    with the build produced by the current workspace. Treat a failed/current
    build as a failed release; never report an older still-serving build as the
    new release.

## Standard-server layout

On a non-Replit Linux server, run the API under a process supervisor and serve
the frontend separately:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run migrate
pnpm run build:production
NODE_ENV=production PORT=8080 pnpm run start:production
```

Configure nginx, Caddy, or another production web server to:

1. Serve `artifacts/crypto-exchange-widget/dist/public`.
2. Proxy `/api/` to `http://127.0.0.1:8080`.
3. Rewrite non-file frontend requests to `index.html`.
4. Forward the original `Host` and HTTPS scheme.
5. Terminate TLS and apply request/body limits appropriate for the public API.
