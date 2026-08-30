# Development

The app uses React, Vinext, the Sites Vite plugin and Cloudflare D1. This directory is the application root. Keep the pnpm lockfile and dependency security settings.

- Install: `pnpm install`
- Development: `pnpm dev`
- Type checking: `pnpm typecheck`
- Validation tests: `pnpm test`
- Local integration test (development server running): `pnpm test:integration`
- Targeted local test cleanup: `python tests/cleanup-local.py`
- Build: `pnpm build`
- Schema migrations: `pnpm db:generate`

The first schema is shared between Drizzle's committed migration and local initialization. D1 operations use bound prepared statements. Order creation and status changes are transactional; the order ID is a client-generated idempotency key. Status writes compare the stored state and record a unique transition ID so concurrent completion cannot duplicate an event. Profile edits use revision checks. New orders retain a complete profile snapshot.

Local and hosted D1 are separate. Do not commit `.wrangler`, database files, customer records, environment secrets, publishing tokens or test fixtures. Deployment must retain owner-only access unless the user explicitly requests otherwise. Current application data is for one owner-operated workspace; do not make the site public without adding suitable application authentication and authorization.

Run integration tests only against localhost. The test writes exact record IDs to ignored `work/integration-records.json`. Cleanup deletes only these local test records, never all rows.
