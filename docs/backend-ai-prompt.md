# Prompt to give your backend-development AI

Give the AI access to this repository and these two files:

- [Website current state](website-current-state.md)
- [Backend requirements](backend-requirements.md)

Then copy the prompt below. It requests implementation and integration, not only an architecture plan. The snapshot is dated 4 November 2026; the AI should recheck the source before making changes if the website has changed since then.

---

You are my senior backend engineer. Build and connect the backend for my existing **AURIE fashion e-commerce website**, covering every current function that needs server-side behavior. Work in the repository I provide, preserve the current storefront design, and finish usable features with tests and documentation.

Read `docs/website-current-state.md`, `docs/backend-requirements.md`, the applicable repository instructions, and the actual frontend before coding. Treat the current source as the authority for existing behavior and the requirements document as the target implementation. Reconcile any changes since the documentation snapshot. Do not assume a backend exists because a frontend service function or button exists.

## Context

The website is a React 19 + TypeScript + Vite 8 frontend under `frontend/`, with shared response types in `shared/types.ts`. Its customer-facing brand is AURIE, based in Kigali/Rwanda. Currency is RWF. Legacy `lenos` storage keys and SKUs remain and must be handled deliberately.

The previous Express backend was removed. The current frontend has eight sample products and optional API adapters. When `VITE_API_BASE_URL` is empty, only browsing, guest cart/wishlist and local form exploration work. Accounts, admin, checkout, request submissions and tracking are unavailable. `VITE_API_EVENTS_URL` optionally enables SSE. All fetch requests use `credentials: 'include'`.

The main integration files are:

- `frontend/src/services/http.ts`, `api.ts`, `account.ts`
- `shared/types.ts` and `frontend/src/types/index.ts`
- `frontend/src/App.tsx`
- All views in `frontend/src/views/`
- `CheckoutModal.tsx`, `CartDrawer.tsx`, `WishlistDrawer.tsx`, `ProductCard.tsx`, `QuickViewModal.tsx`, `SearchModal.tsx`, and `ImagePlaceholder.tsx` in `frontend/src/components/`

Keep the existing `npm run dev`, `npm run typecheck`, `npm test`, and `npm run build` workflows working, or document any deliberate script changes. Respect existing uncommitted work and do not restore deleted backend code indiscriminately. Ignored `.data/` files may contain legacy customers, demo credentials and exported records; preserve them and make migration explicit and opt-in.

## How to work

1. Inspect the repository and map requirements B01–B26 to files, APIs, database entities, tests and integration work.
2. If I have specified a backend stack, use it. Otherwise choose a small, maintained stack that fits the existing TypeScript frontend, a transactional database, durable file/object storage and the deployment environment. Explain the choice briefly, verify current official dependency/provider documentation where needed, and proceed with reasonable configurable development defaults.
3. Ask only for information that truly blocks work, such as an unavailable external account or an unavoidable business decision. Continue independent implementation while those details are outstanding.
4. Implement the backend and the necessary frontend integration changes in coherent stages. Do not stop after a plan, schema, endpoint stubs, mock responses, or a partially connected admin screen.
5. Keep development fakes/test fixtures explicitly separate from production paths. Missing external credentials must produce an honest unavailable/pending state, never fabricated payment success.
6. Do not deploy live services, process real charges, send real customer messages, or migrate sensitive production data without the appropriate explicit instruction. Prepare runnable, reviewable code and a clear configuration/deployment handoff.

## Implement all current workflows

### Catalogue and storefront

Persist products with ID, name, tagline, category, subcategory, RWF price, image, description, materials, sizes, colors with name/hex, stock, SKU, gender, featured/new-arrival flags, and server timestamps.

Support Men, Women, Unisex and Culture. `All` is a filter, not a category. Preserve uppercase Customs gender versus lowercase product gender and the `IN PRODUCTION` status spelling. Keep Culture category distinct from gender.

Keep home featured selection, collection browsing, search, size/in-stock filters, price/newest sorting, quick view, product detail, related items, wishlist and all add-to-cart entry points working. Local filtering/search is acceptable initially; do not break them by returning a partial page where the UI expects the whole catalogue.

Support admin product create/edit/archive or safe delete, unique SKU validation, stored images, and authoritative stock. Preserve historic order-item snapshots when catalogue data changes. Seed the exact eight sample products for development without treating them as verified production inventory.

### Accounts, cart and wishlist

Implement customer signup, login, session restoration, logout and durable saved shopping. Customer responses contain `id`, `name`, `email`; authenticated account responses contain `{ customer, cart, wishlist, orders }`; an unauthenticated session returns `{ customer: null }`.

Use secure password storage and revocable sessions with server-side authorization. Enforce ownership on every customer operation. Implement cookie/origin/CSRF/CORS protection for the chosen deployment and adapt the HTTP client where needed. Keep private credentials out of frontend environment variables and logs.

Preserve guest local cart/wishlist storage, then merge it reliably on login/signup. Cart identity is product ID + size + color. Wishlist identity is product ID. Validate referenced products/options, quantity limits and current availability. Do not trust nested product prices from storage.

Make merge/save retry-safe, handle concurrent tabs and stale debounced requests, and clear guest storage only after confirmed persistence. Do not block session logout indefinitely because saving the cart failed. Account order history must reflect real current statuses; profile is currently read-only.

### Checkout, delivery and orders

Implement a server quote and one shared order-creation service for guest and account checkout. Accept product IDs/options/quantities and contact/delivery fields; reload authoritative prices and stock on the server. Create immutable item/address/price snapshots, server IDs/numbers/timestamps and customer-friendly timeline records.

The existing delivery fields are full name, email, phone, province, district, sector/cell, street/house/landmark, and optional instructions. Preserve Rwanda-focused input. Current delivery is 2,500 RWF unless subtotal is strictly greater than 120,000 RWF, when it is free. At exactly 120,000 it is still charged. Keep this as a configurable compatibility default; explicitly record the unresolved Rwanda-wide serviceability/fee policy rather than inventing it. No tax/coupon engine currently exists.

Buy Now currently adds to the whole existing cart before checkout; preserve this unless I approve a deliberate behavior change. Reject empty orders and invalid quantities/options. Explain repricing/unavailable items before payment.

Use stable idempotency keys for BOTH guest and account checkout, including timeout/retry/reload recovery and different-payload conflicts. Reserve/commit/release stock atomically and prevent overselling, duplicate deductions and stale admin stock overwrites. Define reservation expiry and late-payment reconciliation.

Use separate fulfillment and payment states. Fulfillment supports `PENDING`, `CONFIRMED`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`; payment supports `PENDING`, `SUCCESSFUL`, `FAILED`, `REFUNDED` as the current simplified projection. Validate transitions and record history/audit evidence. An unpaid saved order is not a paid confirmed dispatch.

### Payments

Replace the retained simulated checkout with actual provider integration, or clearly unpaid save-for-later behavior where intended. Flutterwave is named by the UI; verify its current official Rwanda/RWF, card/mobile-money, merchant, webhook, verification and refund documentation before coding provider specifics.

CRITICAL: the current browser sends `CONFIRMED`, `SUCCESSFUL`, client totals and fake transaction references/IDs for both guest and signed-in orders. Never trust those fields. Remove them from request DTOs and generate/verify payment truth on the server.

Use supported hosted/tokenized card collection and provider mobile-money initiation. Do not store raw card details, CVC or mobile-money PINs. Include the actual payer mobile number; the current simulation collects it but does not send it. Display only payment methods enabled for the merchant; the UI mentions MTN/Airtel, while `airtel_money` also exists as an unused separate enum value.

Persist payment attempts, provider references, environment, amount/currency, verification and failure states. Verify callback authenticity and provider transaction details before marking paid. Match the order/reference, amount, currency and environment. Handle duplicate/delayed/out-of-order callbacks exactly once, reconcile missed callbacks, and keep inventory/order effects consistent.

Implement pending/failure/retry/resume UI and confirmation based on returned server state. If preserving refund capability, perform real authorized provider refund operations with idempotency and a ledger; a dropdown value is not a refund. Keep electronic payment status provider-derived. Never call simulated or manually recorded money provider-verified.

### Customs and tracking

Persist every current Customs field: name, phone/WhatsApp, email, fit/collection, free-form clothing type, preferred color, measurements, occasion, description, reference image, preferred deadline, status, request number, timestamps, and optional notes/estimated price.

Required form fields are name, phone, email, clothing type, color, description and preferred deadline; fit defaults to Unisex. Measurements, occasion and reference image are optional. Clothing-type suggestions must not become a restrictive enum. Keep one JPEG/PNG/WebP reference up to 5 MB with server-side validation and private storage. Preserve form data on errors and make submission retries idempotent.

Generate real request numbers and return success only after persistence. Support `NEW`, `CONTACTED`, `DESIGNING`, `APPROVED`, `IN PRODUCTION`, `READY`, `COMPLETED`, `CANCELLED`, with a valid transition policy and history. Distinguish a requested deadline from an accepted completion promise.

CRITICAL: the current customer tracking code downloads all custom requests and searches locally. Replace it with single-request authorized lookup. Keep the list endpoint admin-only. Use customer ownership or a high-entropy guest tracking token/verified access flow; a guessable request number alone must not expose personal details or private images. Update the submission and tracking UI to retain/use the required proof.

Return only a safe tracking DTO; separate internal notes from customer-visible tailor notes. Refresh/subscribe to the current request and show cancellation explicitly. The current admin screen has a status selector and note display but no note editor; add an editor if exposing note updates. Quotes, deposits, appointment booking and customer design approval are additional features, not already implemented flows.

### Admin, settings, media and updates

Implement protected admin authentication, session restoration/logout, overview, products, orders/details, Customs, inventory, and gateway settings. The current login sends only `{ password }`; provide a secure compatibility approach or deliberately update the form for individual admins. Never ship a known default production password or rely on the frontend gate for authorization.

Overview must correctly show paid gross order totals, order count, pending/confirmed count, active Customs, product count, low stock and recent orders. Current low-stock logic is `< 10`; align inconsistent boundary styling. Payment transaction lists must show actual payment data, not label every order verified. Make live/health labels truthful.

Support atomic inventory `−1`, `+1`, `+5` operations with audit reasons and canonical returned stock. Fix zero-stock/zero-price product-editor defaults and preserve Culture gender. Preserve product fields; add missing editor controls when required for managing tagline, colors and featured/new flags.

Move product/reference uploads out of data URL JSON into durable storage with verified file type/size, generated filenames, permission checks and unused-file cleanup. Product photos can be public; Customs references require private access. Explain upload failures and keep previews where appropriate.

Gateway settings may expose public key, merchant name, mode, currency and non-secret configuration status. Remove `secret_key` from the browser type; never return it or post back an unfiltered server config object. Keep credentials in server-only configuration.

Use the current store event names through adapters: `product_created`, `product_updated`, `product_deleted`, `order_created`, `order_updated`, `custom_request_created`, `custom_request_updated`. SSE messages use `{ type, data }` consumed by `onmessage`. Scope audiences, enforce session permissions, deduplicate local responses/server echoes, ignore stale versions and reconcile after reconnect. Update customer order history and the active Customs result, not only toasts. A documented refetch/polling implementation is acceptable if live claims match it.

The `/admin/settings` route is accepted but has no implemented screen. Resolve that shell deliberately; do not claim a general settings UI already exists. Preserve frontend-only theme, navigation, modals, marketing content and size guide without unnecessary new services.

## Existing API compatibility

Preserve these paths and shapes when safe, or update their adapters and all consumers together:

```text
GET    /api/products                       -> Product[]
POST   /api/products                       -> Product
PUT    /api/products/:id                   -> Product (current client sends partial updates)
DELETE /api/products/:id                   -> JSON or 204

GET    /api/orders                         -> Order[] (admin only)
POST   /api/orders                         -> Order (guest checkout)
PATCH  /api/orders/:id/status               -> Order

GET    /api/custom-requests                -> CustomClothingRequest[] (admin only)
POST   /api/custom-requests                -> CustomClothingRequest
PATCH  /api/custom-requests/:id/status     -> CustomClothingRequest

GET    /api/account/session                -> Account or { customer: null }
POST   /api/account/signup                 -> Account
POST   /api/account/login                  -> Account
POST   /api/account/logout                 -> JSON or 204
PUT    /api/account/shopping               -> JSON or 204 (adapt to use canonical saved state/version)
POST   /api/account/orders                 -> Order (customer owner from session)

GET    /api/admin/session                  -> { authenticated: boolean }
POST   /api/admin/login                    -> { authenticated: true } on successful HTTP response
POST   /api/admin/logout                   -> JSON or 204

GET    /api/flutterwave/config             -> sanitized non-secret config
POST   /api/flutterwave/config             -> JSON or 204
```

Add the required quote, payment initiation/status/webhook, secure request tracking, uploads, atomic inventory, order refetch, payment ledger/refunds and health contracts described in the requirements document. Do not introduce public bulk customer data access to satisfy a broken frontend assumption. Successful record-returning operations must return JSON. Errors must retain a user-readable `{ error: string }` field and appropriate HTTP status codes.

## Required tests and deliverables

Create meaningful backend/integration tests for authorization and ownership, session invalidation, validation, durable persistence, login merge, forged checkout fields, idempotency, concurrent last-unit purchases, inventory adjustment conflicts, real provider-adapter sandbox/test outcomes, webhook authenticity and duplicates, failed/expired/late payments, refunds, private tracking/media, and scoped event delivery.

Test every B01–B26 requirement using the acceptance checklist in `docs/backend-requirements.md`. Keep existing frontend service tests passing and run typecheck/build. Exercise the principal customer/admin flows in the browser or end-to-end tests where possible. Report exactly what was exercised and distinguish local tests, provider sandbox verification and live production readiness.

Deliver:

1. Implemented backend and connected frontend changes.
2. Database schema, migrations, constraints/indexes, and repeatable development seed.
3. API contract documentation, preferably OpenAPI, including auth, errors, upload and event contracts.
4. Separate frontend and backend environment examples with placeholders only.
5. Setup, migration, start, test, build, deployment, backup/restore and webhook configuration instructions.
6. Secure admin provisioning instructions and an optional deliberate legacy-data migration plan.
7. A coverage table for B01–B26 with implemented files, tests and any true external blockers.
8. A clear final report of what works, what was verified, and which credentials/business decisions/deployment steps remain.

Do not call the backend finished while a current core function still uses fake success, a public private-data list, client-owned pricing/payment status, unpersisted uploads, or unprotected admin mutations. Do not silently expand scope into unrelated features such as reviews, coupons, newsletters or a CMS. Complete the documented current website first.

Start by inspecting the repository, briefly state your architecture and staged implementation plan, and then implement it.

---

If the AI cannot access files, attach the two documentation files along with the current repository or relevant source. The prompt is detailed, but the actual source and full requirements are needed to preserve exact interfaces and finish every integration.
