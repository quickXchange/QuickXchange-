# QuickXchange reusable source synchronization

This branch contains the current Website, Telegram Mini App, API, shared libraries, schema migrations, tests, public artwork and build configuration from the Replit workspace.

Includes 1Forge, WhiteBIT, blockchain RPC monitoring, provider selection, API integration settings, connection tests, health monitoring and Manual fallback. Runtime credentials and live configuration remain external.

Excluded: environment files, credentials, database exports, customer data, private workspace context, private attachments (the two reviewed runtime BBVA logos are retained), reports, exported packages and design-sandbox scratch content. Customer-specific one-time recovery inputs are omitted; migration filenames and ordering are retained using harmless no-op statements where appropriate. Generic recovery and monitoring code is retained.

The Replit application and database are unchanged. This branch is based on the existing GitHub main history, without force-pushing or rewriting historical commits. Exclusions apply to this branch snapshot, not to pre-existing historical commits.

Build with pnpm install --frozen-lockfile followed by pnpm run build:production. Do not copy live credentials or a production database into another project.

The source-only dependency lockfile is reconciled with the existing catalog configuration and excluded sandbox importer; installed library versions are unchanged.
