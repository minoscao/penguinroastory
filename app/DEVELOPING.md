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

## Demo catalog

An explicit POST to `/api/roastery` with JSON `{ "kind": "demo" }` imports fictional data from `lib/demo-data.ts`. It never runs automatically on page reads. Stable `demo-v1-` identifiers and a single transactional `INSERT OR IGNORE` batch preserve existing records, including edits to demo records, when imported again. The local integration test also imports this dataset and deliberately leaves it available for trying the UI.

`is_demo` distinguishes sample records. New profiles inherit this flag from the bean; new orders inherit it from any selected sample customer, bean or profile. Add `source=real` to catalog and order reads to exclude sample records. Customer types are `individual`, `business`, or `unspecified` for legacy records. Existing records are never classified from their names. Customer card totals count orders for that customer, within the chosen source filter.

The three generated coffee pictures in `public/images` are flavor illustrations, not product photographs. Sample profile values are for demonstrating the software only and must not be used to operate a roaster.
