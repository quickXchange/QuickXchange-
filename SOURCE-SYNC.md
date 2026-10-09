# QuickXchange reusable source synchronization

This branch contains the current Website, Telegram Mini App, API, shared libraries, schema migrations, tests, public artwork and build configuration from the Replit workspace.

Includes 1Forge, WhiteBIT, Quickex Convert, Alchemy and other existing RPC integrations, blockchain monitoring, provider selection, API integration settings, connection tests, health monitoring, Manual fallback, the Telegram Exchange Bot and the Telegram Mini App. Backend services, frontend components, Admin settings, database models and related tests are included. Runtime credentials and live configuration remain external.

See INTEGRATIONS.md for the reusable integration map and white-label deployment boundaries. INTEGRATIONS.json inventories the reviewed source files by integration with SHA-256 checksums.

Excluded: environment files, credentials, database exports, customer data, private workspace context, private attachments (the two reviewed runtime BBVA logos are retained), reports, exported packages and design-sandbox scratch content. Customer-specific one-time recovery inputs are omitted; migration filenames and ordering are retained using harmless no-op statements where appropriate. Generic recovery and monitoring code is retained.

The Replit application and database are unchanged. This branch is based on the existing GitHub main history, without force-pushing or rewriting historical commits. Exclusions apply to this branch snapshot, not to pre-existing historical commits.

Build with pnpm install --frozen-lockfile followed by pnpm run build:production. Do not copy live credentials or a production database into another project.

The source-only dependency lockfile is reconciled with the existing catalog configuration and excluded sandbox importer; installed library versions are unchanged.
