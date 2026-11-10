# Delivery verification — 4 November 2026

The backend is implemented in `C:/Users/ccely/lenos-backend` and its frontend integration is applied to `C:/Users/ccely/lenos-v1`. The API runs locally on port 3000. Swagger UI at `http://localhost:3000/docs/` exposes 47 documented operations, including interactive requests. No public host has been deployed.

## Checks completed

| Check | Result | Scope |
|---|---|---|
| Backend `npm test` | 20 passed, 0 failed | Isolated SQLite integration tests; auth/ownership/CSRF; authoritative totals; idempotency; competing buyers; stock reservations; payment/refund state; authenticated webhooks; private Customs/media; scoped events; persistence and restore |
| Backend TypeScript/build | Passed | Strict typecheck and compiled server/CLI output |
| OpenAPI generation | Passed | `docs/openapi.json`, 47 operations; Swagger served by the running API |
| Original frontend service suite | 3 passed, 0 failed | Existing tests preserved unchanged; run in the staged and actual frontend |
| Integrated frontend TypeScript/build | Passed | Staged source typechecked; final source built in the actual `lenos-v1` repository |
| Microsoft Edge end-to-end suite | 5 passed, 0 failed | Real browser against the running local API and the staged frontend with matching integrated source |
| Backup/restore | Passed | Consistent `VACUUM INTO` snapshot; restored database integrity and persisted order checked by integration test |
| Docker Compose configuration | Passed | `docker compose config --quiet` |
| Docker image build/container run | Not verified | Docker Desktop's Linux engine was unavailable; no successful image build or container startup is claimed |
| Flutterwave merchant sandbox | Not run | Merchant credentials/account configuration were not supplied |

The final browser run exercised:

1. Swagger opens and its **Try it out** button executes `GET /api/products` and returns persisted catalogue data.
2. Guest checkout reviews the server quote, persists an unpaid order, honestly displays unavailable online payments, and resumes the same order after reload.
3. Signup merges the guest bag once. A deliberately lost save response after a real server commit retains a recovery backup; after reload, recovery restores quantity two without doubling it. Logout invalidates the session and retains separately stored guest items.
4. Customs accepts an actual image upload, persists the request and private tracking proof, and loads the authorized request after reload.
5. An explicitly provisioned temporary admin logs in, increments stock atomically, opens gateway settings, and logs out. The test removes its admin identity afterward.

Earlier browser checks found a local Swagger connection failure. Development no longer sends HTTPS-upgrade directives or HSTS; production retains HTTPS headers. The final complete five-test browser run passed. Local tests resolve localhost to IPv4 to match the development listener. No production HTTPS setting is disabled by the tests.

Browser checks created clearly named local test customers, unpaid orders, Customs submissions/images and inventory adjustments. These are development records in ignored `.runtime/` storage. The seed contains the original eight products and no default administrator or fake paid order.

## Applied frontend changes

Sixteen integration files were initially applied, followed by two final recovery corrections. Originals were backed up under:

- `.runtime/frontend-backup/20261104-162710`
- `.runtime/frontend-backup/20261104-164834`

The copy procedure checked source and original destination hashes before writing. Existing unrelated changes, deleted legacy backend files and ignored legacy data were preserved. `.env.local` sets the public local API URL; restart the frontend dev server if it was started before that setting existed.

## Remaining launch work

- Start a working Docker engine and run the documented image/container checks. The Compose configuration uses a persistent named volume and one API replica.
- Configure the actual Flutterwave merchant sandbox and run the acceptance cases in [operations.md](operations.md). Local tests exercise the real HTTP adapter with controlled responses; they do not prove merchant eligibility or actual payment/refund disbursement.
- Provision your administrator using your own credentials, then configure the chosen host/domain, TLS, exact frontend origin and secure cookies.
- Confirm delivery coverage, stock/reservation policy and refund authority. Review the original frontend's two reported dependency audit findings recorded in [coverage.md](coverage.md).

Use [coverage.md](coverage.md) for the B01–B26 implementation mapping and [swagger-walkthrough.md](swagger-walkthrough.md) for API testing. No real charge, refund, customer message or sensitive legacy-data migration was performed.
