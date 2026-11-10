# Requirements coverage — 4 November 2026

Backend paths below are relative to this repository. Frontend paths refer to `lenos-v1/frontend/src/` (also present in the staged integration). This table distinguishes local implementation and verification from external production acceptance.

| ID | Implementation | Verification / remaining dependency |
|---|---|---|
| B01 | `services/catalog.ts`, exact `seed-products.ts`, product flags/editor | Catalogue tests, original frontend tests/build; featured selection retained |
| B02 | Full bare-array catalogue, four categories, options, stock, versions | Catalogue validation/archive tests; browser shop loads stored products; original filtering retained |
| B03 | Full names/taglines/descriptions/category supplied to existing local search/related items | Frontend typecheck/build; no new search service |
| B04 | Complete Product DTO, canonical choices, zero price/stock, Culture gender | Catalogue tests; unchanged cards/quick view; product detail remounts on selection |
| B05 | `catalog.lines`, quote and checkout validation; Buy Now still uses whole bag | Forged/invalid input tests, last-unit tests, browser checkout |
| B06 | Legacy guest local keys retained; defensive parsing and quote revalidation | Existing no-API tests; browser guest purchase/reload recovery |
| B07 | `auth.ts`, scrypt, hashed revocable sessions, cookie/CORS/custom-header CSRF | Signup/session/logout/CSRF/origin integration tests; browser signup/logout |
| B08 | `shopping.ts`, versioned saves, idempotent merge; App serializes saves, retains conflicts | Retry merge/stale-write/checkout-clear tests; browser guest merge and reload |
| B09 | Account returns only owner profile/orders; account refetch and payment resume | Ownership tests, browser account restore; read-only profile retained |
| B10 | Shared `Orders.create` for both routes, idempotency, immutable snapshots, transaction | Guest/account tests, duplicate/conflicting key tests, browser pending-order recovery |
| B11 | Rwanda address/province validation; integer server prices and compatible delivery rule | Exactly 120,000 and above tested; actual nationwide coverage still a merchant decision |
| B12 | `flutterwave.ts`, `payments.ts`; hosted cards and payer-number Rwanda mobile money; quote/payment UI | Adapter contract + controlled provider response tests. **Merchant sandbox card/MoMo tests require credentials** |
| B13 | Every admin route protected, session revoke, secure CLI provision, optional email login UI | Admin denial/login/logout tests and browser admin flow |
| B14 | `/api/admin/overview`, actual committed orders and paid gross split test/live; truthful labels | Integration fixtures and browser admin data; gross includes delivery and refunded gross history, not net settlement |
| B15 | Validated product CRUD, optimistic versions, archive, durable upload, editor controls | Catalogue/SKU/zero-value/archive tests; original frontend build; server preserves order snapshots |
| B16 | Delta adjustments, reservation-aware availability, stock audit, canonical returns | Concurrent buyers, adjustments, stale absolute edits, separate DB connections; browser increment |
| B17 | Fulfillment transition graph, immutable timeline, cancellation/restock, audit | Invalid transition/unpaid dispatch denial; verified payment and cancellation tests |
| B18 | Provider-derived payment status; refund/reconcile/recover routes and admin ledger | Duplicate/failure/refund/unknown-recovery tests. **Actual refund disbursement needs provider sandbox acceptance** |
| B19 | Non-secret config, deployment-only credentials/mode/methods, real attempts/refunds | Secret disclosure/allowlist tests; browser settings routes to implemented surface |
| B20 | All Customs inputs, arbitrary garment text, persisted history, retry-safe request | Backend Customs tests; browser submission/recovery proof; no invented completion promise |
| B21 | `media.ts`, private refs, decoded/re-encoded bounded image files, upload grants/cleanup | HTTP multipart type/size/auth tests; ownership/bound-token tests; browser image upload |
| B22 | Owner/private-token single-request lookup, safe tracking DTO, private media checks | Wrong token/other account/anonymous list tests; browser tracking after reload |
| B23 | Admin Customs list, one-step status graph, cancellation, separate internal/public notes, note editor | Status/history/private-note tests; admin UI typecheck; no quote/deposit workflow claimed |
| B24 | Durable scoped polling envelopes/cursors; session revalidation; versioned upserts and refetch | Public/owner/admin/logout event tests; browser updates; no unsupported SSE/live claims |
| B25 | Clear errors, disabled provider methods, preserved pending intent/forms/cart; independent admin fetches | Existing three frontend service tests, missing-credential tests, browser honest unpaid confirmation |
| B26 | SQL migrations/indexes/constraints, repeatable exact seed, health, OpenAPI/Swagger, Docker, provisioning/backup docs | 20 backend tests, builds/typechecks, browser checks, backup/restore integrity test. **Docker engine and live host/TLS remain external checks** |

## Verified locally

- 20 backend integration/adapter tests in `tests/backend.test.ts` use isolated temporary SQLite databases and controlled payment-provider responses.
- The original three `lenos-v1` frontend service tests remain unchanged and pass.
- Backend and integrated frontend TypeScript checks and builds pass.
- Browser checks in `e2e/storefront.spec.ts` exercise Swagger Try It Out, guest quote/order/reload, signup/guest merge/logout, Customs upload/submit/private tracking, and admin login/inventory/settings/logout. See the final verification report for the last run's result.
- `db:backup` produced a consistent local snapshot. The integration suite restores a backup into a second store, checks `PRAGMA integrity_check`, and confirms order persistence.

## External acceptance still required

No real provider charge, refund, notification, live deployment or sensitive data migration was performed. Flutterwave merchant eligibility, RWF methods, keys/account ID, webhook setup, end-to-end provider sandbox results, production hosting/TLS, same-site cookie deployment behavior, monitoring destination, delivery policy, and workshop/stock/refund policies require the actual deployment/merchant context. The Docker engine on this machine did not become reachable during the initial validation attempt; the Docker build is not counted as passed.

The frontend's unchanged lockfile reported two high-severity audit findings: Vite 8.3.1 and transitive source-map-js 1.2.1. They are separate from the new backend dependency tree, whose install audit reported zero vulnerabilities. Dependency changes should be evaluated against the original frontend project rather than applied as an unrelated forced upgrade.
