# AURIE backend requirements and integration specification

Prepared **4 November 2026**, from the current repository. Read [Website current state](website-current-state.md) for the evidence and exact existing behavior. Use [AI backend build prompt](backend-ai-prompt.md) to implement this specification.

This is a **proposed implementation specification**, not a claim that these backend services already exist. “Required” means needed to make the current website's workflows reliable and safe. Optional additions are explicitly marked.

## 1. Scope and completion standard

Build durable services for catalogue, product media, customer and admin authentication, saved shopping, guest/account orders, payment processing, delivery pricing, fulfillment history, custom clothing requests, private tracking, inventory, gateway settings, and store updates. Connect the existing frontend to those services while retaining its design and current browsing/shopping behavior.

The backend must own identity, permissions, prices, inventory, payment truth, record identifiers, timestamps, and state transitions. Browser-provided product objects and totals are input to validate, not records to trust.

Some requirements necessarily change the frontend: simulated payments, bulk public Customs lookup, editable electronic-payment status, browser-secret types, and stale event handling cannot be made correct by merely adding matching endpoints.

A feature is complete when its user action reaches the service, persists correctly, returns authoritative state, renders success/failure honestly, respects permissions, and passes a meaningful end-to-end or integration check.

## 2. Full feature-to-backend coverage

| ID | Existing function to support | Required backend behavior / integration work |
| --- | --- | --- |
| B01 | Home featured edit | Return accurate products and featured flags; preserve featured-first, four-item selection |
| B02 | Shop collections, filters, sort, counts | Persist catalogue/category/size/stock/timestamps; current browser filtering may remain |
| B03 | Search and related pieces | Supply searchable product fields; current local search and same-category recommendations may remain |
| B04 | Product card, quick view, detail | Return stable IDs, all choices, price, SKU, image, materials, description, stock, flags |
| B05 | Add to bag and Buy Now | Validate product, size, color, quantity and availability; Buy Now continues to use the whole cart |
| B06 | Guest cart and wishlist | Preserve local browsing; revalidate records at checkout and login; durable guest carts are optional |
| B07 | Customer signup, login, session, logout | Secure customer accounts and revocable sessions; correct hydrated account response |
| B08 | Account cart/wishlist, login merge | Persist by authenticated owner; canonicalize product data; reliable merge and save conflict behavior |
| B09 | Account profile and order history | Return only owner's safe profile and orders; keep status/timeline current |
| B10 | Guest and account checkout | One authoritative order service, separate access adapters, idempotency, pricing and inventory transaction |
| B11 | Rwanda delivery fields and totals | Validate address/contact; calculate delivery on server; store immutable address/price snapshots |
| B12 | Card/mobile money selection and confirmation | Real provider session/intent, server verification, verified webhook handling, pending/failure/retry states |
| B13 | Admin login, refresh, logout | Admin authorization on every operation; provisioning and session invalidation |
| B14 | Admin overview and recent orders | Accurate lists/aggregates, descending dates, actual payment truth, no static “verified” assertion |
| B15 | Admin product add/edit/delete and images | Validated CRUD, unique SKU, safe archive/delete behavior, real image storage |
| B16 | Inventory −1/+1/+5 and stock display | Atomic adjustments, purchase/reservation concurrency, nonnegative stock, audit history |
| B17 | Order filters, detail, fulfillment updates | Admin list/read, permitted transitions, immutable timeline events, stock/payment side-effect rules |
| B18 | Admin payment state controls | Provider-derived status; explicit refund/reconciliation workflows instead of a free-form paid/refunded dropdown |
| B19 | Gateway settings and transactions | Non-secret settings DTO; credentials stay on server; actual payment-attempt records |
| B20 | Customs submit, confirmation, submit another | Durable request with validated fields, generated number, attachment association; retain errors/form input |
| B21 | Customs image upload/remove/preview | Private reference storage, upload validation, access controls and unused-file cleanup |
| B22 | Customs customer tracking | Single-request authorized lookup; prevent enumeration and return only appropriate fields |
| B23 | Admin Customs list and status | Admin read/update, validated workflow, status history; preserve notes and optional estimated price |
| B24 | Product/order/request live updates | Scoped event delivery or refetch/polling; deduplication and state reconciliation |
| B25 | Existing outage/coming-soon behavior | No false success, no local fake orders, clear loading/error/retry states, preserved cart/form input |
| B26 | Deployment and retained data | Migrations, development seed, health checks, deployment configuration, deliberate legacy migration |

Navigation, menus, modals, image placeholders, theme switching, static marketing copy, static size guide, and display formatting remain frontend responsibilities. A CMS, dedicated search server, analytics service, and theme-preference endpoint are not necessary to support them.

## 3. Current HTTP contract to preserve or deliberately adapt

These are the **21 method/path combinations currently called by the frontend**, not implemented server routes. Collection reads currently expect a bare array, not `{ data: [...] }` or a paginated envelope. DTO names are defined in the current-state document and `shared/types.ts`.

The “access” column states the required server policy, not existing server enforcement.

| Method and path | Current request | Current expected response | Required access / notes |
| --- | --- | --- | --- |
| `GET /api/products` | None | `Product[]` | Public published products |
| `POST /api/products` | Product form fields / `Partial<Product>` | Created `Product` | Admin |
| `PUT /api/products/:id` | Partial fields, including stock-only or image-only updates | Updated `Product` | Admin; current client uses PUT as a partial update |
| `DELETE /api/products/:id` | None | JSON or `204`; body ignored | Admin; preserve historical order items |
| `GET /api/orders` | None | `Order[]` | Admin only |
| `POST /api/orders` | Current guest order payload | `Order` | Guest checkout, rate-limited; ignore/reject forged server-owned fields |
| `PATCH /api/orders/:id/status` | `{ status, payment_status?, note? }` | Updated `Order` | Admin; restrict/remove payment mutation as described below |
| `GET /api/custom-requests` | None | `CustomClothingRequest[]` | Admin only; customer caller must change |
| `POST /api/custom-requests` | Custom request form fields | Created request | Public submission, abuse controls; customer association derived from session if present |
| `PATCH /api/custom-requests/:id/status` | `{ status, notes? }` | Updated request | Admin only |
| `GET /api/flutterwave/config` | None | Legacy `FlutterwaveConfig` | Admin; replace with non-secret DTO |
| `POST /api/flutterwave/config` | Loaded/edited config object | JSON or `204`; body ignored | Admin; allowlisted non-secret values only |
| `GET /api/account/session` | Cookie | `Account` or `{ customer: null }` | Current customer session; guest response when no valid session |
| `POST /api/account/signup` | `{ name, email, password }` | `Account` | Public signup, rate-limited; establishes session |
| `POST /api/account/login` | `{ email, password }` | `Account` | Public authentication, rate-limited; establishes session |
| `POST /api/account/logout` | `{}` | JSON or `204`; body ignored | Invalidate current customer session; safe to repeat |
| `PUT /api/account/shopping` | `{ cart: CartItem[], wishlist: Product[] }` | JSON or `204`; body currently ignored | Customer, own data only; canonicalize IDs/options rather than trusting nested objects |
| `POST /api/account/orders` | Order payload plus `checkout_key` | `Order` | Customer; owner derived from session |
| `GET /api/admin/session` | Cookie | `{ authenticated: boolean }` | Expose only current-session state |
| `POST /api/admin/login` | `{ password }` | JSON, convention `{ authenticated: true }` | Password-only compatibility adapter or deliberate frontend change to staff identity |
| `POST /api/admin/logout` | No body | JSON or `204` | Invalidate current admin session; safe to repeat |
| `GET /api/admin/customers?search&limit&offset` | Optional name/email search and pagination | `{ customers, total, limit, offset }` | Admin only; returns registered customer contact fields, never credentials |
| `GET /api/admin/emails/status` | None | `{ configured, sender_email }` | Admin only; never return provider credentials |
| `GET /api/admin/emails?limit` | Optional page size | `{ emails }` | Admin only; recent email attempt history, never message bodies |
| `POST /api/admin/emails/send` | `{ customer_id, subject, text }` plus `Idempotency-Key` | Email attempt record | Admin only; one registered customer per plain-text message |

The account helper chooses GET if body is omitted and POST otherwise, unless a method override is supplied. Domain helpers JSON-encode request bodies. Requests send cookies. IDs in the domain URL paths are URL-encoded.

### Response and error rules

- Current `apiRequest` parses successful JSON, or treats `204` as no value. Do not return `204` where the client expects a created/updated record or session object.
- Return `{ "error": "Human-readable message" }` on errors. Additional stable `code` and `field_errors` fields may be added alongside `error` when the frontend uses them.
- Proposed status mapping: `400` malformed input, `401` authentication required, `403` forbidden, `404` not found/inaccessible object, `409` stock/version/idempotency conflict, `422` field validation if used consistently, `429` throttled, `503` service temporarily unavailable.
- Return no password hashes, session secrets, payment secrets, unrestricted private media URLs, or other customers' data in errors or success responses.
- Return server timestamps consistently as ISO strings and RWF amounts in the existing numeric representation. Use a precise, documented money representation internally and explicit provider amount conversion.
- Order response `items` and `timeline` must always be arrays. Avoid exposing internal audit events as customer timeline text.

### Required additional contracts

The routes below are **proposals**, not current calls. Naming can change if the corresponding adapters, types, docs, and tests change together.

| Proposed route | Purpose and access |
| --- | --- |
| `POST /api/checkout/quote` | Accept product IDs/options/quantities and destination; return authoritative lines, availability, delivery fee, currency, total, quote version/expiry |
| `POST /api/orders/:id/payment-session` | Authorized owner or scoped guest token; start/reuse a real provider payment attempt for the server total; accept idempotency key and payer mobile number where applicable |
| `GET /api/orders/:id/payment-status` | Owner/scoped guest access to current verified/pending/failed payment state |
| `POST /api/payments/flutterwave/webhook` | Provider-authenticated callback; implement authentication/signature verification from current official provider documentation |
| `GET /api/account/orders` | Own order list/refetch; introduce adapter and event/refetch behavior |
| `GET /api/account/orders/:id` | Own order details; optional if refreshed list already suffices |
| `POST /api/custom-requests/track` | Submit request number plus access proof; return only that request's safe tracking DTO |
| `POST /api/uploads` | Validated product image or private Customs reference upload; role/purpose-specific limits; return an opaque media ID and appropriate display URL |
| `POST /api/admin/inventory/:productId/adjustments` | Atomic delta, reason, idempotency key/version; return canonical product/stock |
| `GET /api/admin/payments` | Admin payment-attempt ledger with truthful verification/refund state |
| `POST /api/admin/payments/:paymentId/refunds` | If preserving real refund capability, authorized refund action with reason, amount, idempotency and provider confirmation |
| Configured SSE URL, e.g. `/api/events` | Public catalogue events; session-scoped private order/request/admin events |
| `GET /health/live`, `GET /health/ready` | Deployment liveness/readiness without exposing secrets |

No generic public `GET /api/orders` or public bulk request listing should be introduced for convenience. An order number, email address, or request number alone is not authentication.

## 4. Accounts, authorization, and shopping state

### Customer and administrator identity

Persist customers with normalized unique email, name, password hash, account state, and timestamps. Enforce server-side validation matching or deliberately updating the current form limits. Use a maintained password-hashing implementation; never store plaintext passwords. Login responses must not reveal whether a particular email exists through unnecessarily distinct errors.

Use server-verifiable, expiring, revocable sessions. For cookie sessions, set appropriate HttpOnly, Secure, SameSite and scope attributes for the actual deployment. Rotate session identifiers on authentication; invalidate them on logout. Apply origin/CSRF protection to state-changing cookie-authenticated requests and an explicit frontend-origin CORS allowlist when cross-origin. Cookie and SSE behavior must be tested under the actual frontend/API origin arrangement.

The HTTP client currently has no CSRF-token transport. If using a token-based CSRF design, add token acquisition and headers to the service boundary; otherwise document and test the chosen server-side origin/CSRF protections. CORS alone is not an authorization system.

Separate customer and admin privileges. The existing password-only admin UI can initially map to a securely provisioned operator; never seed a known public/default admin password. Individual staff identities and MFA are optional additions unless the deployment requires them. Avoid granting admin rights merely because a customer has a matching email or because the page route is `/admin`.

Every query/mutation must enforce ownership or role in the service/database query. A customer must not be able to read or change another user's shopping, order, payment, request, or media by substituting an ID. Public submission may accept guest details but cannot choose its own customer ID, status, or price.

### Shopping persistence and merge

Persist cart lines as product reference + size/color choice + positive integer quantity, and wishlist entries as product references. Rehydrate the browser's nested Product shape from canonical catalogue records. Validate options and unavailable/deleted products on reads, updates, merge, and checkout.

Retain guest local storage. On explicit login/signup merge matching lines and wishlist entries consistently, and enforce a documented quantity limit plus stock rules. Make the merge retry-safe so it cannot double quantities. Clear guest storage only after the merged state is durably acknowledged.

Address automatic session restoration, concurrent tabs/devices, stale debounced saves, and logout while a save is pending. Prefer a versioned shopping update or explicit line mutations; if keeping full replacement, detect conflicts and never let an old request resurrect a cleared cart. Consider a server merge endpoint if it simplifies these guarantees.

The logout operation must remain possible even when shopping persistence fails. Let the UI report an unsaved-cart error, but invalidate the session reliably rather than indefinitely blocking logout.

## 5. Catalogue, images, and inventory

### Catalogue

Validate category, gender, unique SKU, nonnegative price/stock, required names/descriptions as appropriate, bounded strings, nonempty selectable options, color names/hex values, flags, and allowed image references. `All` is not a stored category. Assign stable IDs and server creation timestamps.

Preserve category versus gender distinction: Culture products may target men, women, or unisex. The current editor derives Culture as unisex and should not silently overwrite an existing product's gender. Preserve complete descriptions/materials/taglines and all sample option values if seeding development data.

Current API reads may keep returning all published products for compatibility. If pagination/server search is added, update home, shop, search, related products, counts and admin consumers together; do not return only one page to UI that assumes a full catalogue.

Archive products that are referenced by orders, or use protected deletion with immutable order snapshots. Saved carts/wishlists must handle archived products explicitly. A catalogue change must not rewrite historical order prices or names.

### Stock policy

The minimum compatible model is aggregate stock per product, shared across all size/color selections. Preserve that policy until variant-level counts are intentionally introduced. Do not imply variant-level availability while using one total. A future variant table requires migration and admin selection/stock controls.

Use database transactions or equivalent atomic operations for stock reservations, purchase commitment, and admin adjustments. Never accept a browser's stale absolute count without a concurrency check. Return canonical stock after every successful mutation.

Define reservation expiration, payment success commitment, failed/expired checkout release, and cancellation/restock rules. Idempotent retries must not reserve, deduct, release, or restore twice. Prevent a stock decrease from invalidating active reservations without an explicit conflict policy. Test late provider success after reservation expiry: reconcile availability or queue a refund/manual resolution instead of silently overselling.

### Media

Product photos may be public; Customs references are private customer material. Store media outside database JSON using object/file storage with durable metadata. Keep product image URL display compatible; use scoped/signed access for private references where needed.

Validate actual bytes/content, supported type, size, and dimensions server-side. Customs currently promises JPEG/PNG/WebP up to 5 MB. Match that at minimum. Restrict product uploads as well. Use generated storage names and safe response content types; never trust a filename or browser MIME value alone.

Move away from base64 data URLs inside product/request JSON. During a transitional adapter, bound payload sizes including base64 overhead and convert to stored objects. An upload may precede a public guest request: use a short-lived upload ownership token and prevent cross-user attachment reuse. Delete abandoned uploads through a scheduled cleanup policy.

If accepting external image URLs, validate scheme/host policy. If the server fetches a URL, block access to private/internal addresses and unsafe redirects. Do not add a server URL-fetching feature merely to render an existing external URL.

## 6. Checkout, orders, and delivery

### Authoritative checkout sequence

1. Client submits IDs, selected size/color, quantity, destination, and contact details for a quote. It may display local estimates before the quote arrives.
2. Server reloads current products, validates options and stock, calculates line prices/delivery, and returns the authoritative summary. Surface changes to the customer before confirming payment.
3. Create/reuse an order with a stable idempotency key and validated quote/cart version. Derive customer ownership from the session; guests receive a scoped high-entropy access token, stored safely as a hash on the server when appropriate.
4. In one transaction, persist order/item/address snapshots, initial timeline, idempotency record, and inventory reservation as the chosen policy requires.
5. A new unpaid order begins with a server-controlled pending payment state. The current signed-in “save order, pay later” behavior may remain, but it must produce a truly unpaid order and expose a later payment action if live checkout is supported.
6. Create a provider payment attempt from the server amount/currency/reference. For a real payment, use the provider's supported hosted/tokenized flow and return only safe client data.
7. Await verified provider outcome. Persist status, reconcile stock, append timeline, and publish updates only after committing the transaction.
8. Render pending, failed, successful, cancelled, and refunded outcomes from the returned server state. Refreshes/retries must recover the same order/payment attempt.

Both `POST /api/orders` and `POST /api/account/orders` must delegate to the same order domain logic. They differ in authentication/ownership, not pricing, fraud checks, or stock integrity.

### Untrusted current payload

Do not let the current browser choose `price`, `subtotal`, `delivery_fee`, `total`, `currency` outside allowed values, fulfillment/payment status, order number, timestamps, transaction reference, or Flutterwave transaction ID. Reject incompatible fields or explicitly ignore them in a temporary compatibility adapter, then remove them from the frontend request type. Keep create-request types separate from response DTOs; `Partial<Order>` is not an adequate trust boundary.

Idempotency must cover both guest and customer checkout. Store key scope, request hash, processing/result state and result ID with a uniqueness constraint. Same key and same operation returns the same result; same key with different content is a conflict. Preserve the key across uncertain network outcomes and page recovery. A frontend debounce or disabling a button is insufficient.

### Rwanda delivery and totals

Retain name, email, phone, province, district, sector/cell text, street/landmark and notes. Validate and normalize phone numbers without assuming the UI's example prefix proves validity. Keep addresses as order snapshots even if a customer profile later changes.

Initial compatibility pricing is subtotal plus 2,500 RWF delivery, free only when subtotal **exceeds** 120,000 RWF. The current rule is used for every selected province even though the cart labels it Kigali delivery. Treat Rwanda-wide serviceability, out-of-Kigali fees, delivery promises, taxes, and an inclusive-versus-exclusive free-delivery threshold as business decisions; do not invent a tax rate or delivery guarantee.

Reject empty orders and invalid/negative/fractional quantities. Validate totals using precise arithmetic and a documented RWF-to-provider amount conversion. No coupons, taxes, or discounts are implemented today; keep new price components explicit if added later.

### Fulfillment and histories

Implement a permitted transition policy for `PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED`, plus valid cancellation branches. Payment and fulfillment are separate state machines. Decide which actions require successful payment; do not automatically dispatch an unpaid saved order.

Store actor, old/new state, timestamp, and optional reason in an audit/history record. Expose customer-friendly timeline entries separately. Decide how incorrect status changes are corrected with audit evidence. Validate transitions server-side; do not accept arbitrary backward/terminal-state changes just because a dropdown lists them.

Cancellation does not itself prove that money was refunded. Delivered-order returns are a separate, optional future workflow; do not overload normal cancellation without explicit business rules.

## 7. Real payments and gateway management

Flutterwave is the provider named by the current website. Before implementation, verify current official provider documentation, supported Rwanda/RWF methods, merchant eligibility, sandbox behavior, webhook authentication, verification and refund APIs. This document intentionally does not assert a provider API version or that this merchant is already enabled for every method shown in the UI.

Use hosted/tokenized card collection; do not collect or store raw card numbers/CVC or MoMo PINs. For mobile money, send the selected payer number through the supported flow; the current frontend omits it from the payload and must change. Resolve whether Airtel is a separate method or a provider option under mobile money, and expose only actually enabled methods.

For each payment attempt, persist order ID, provider, amount, currency, environment, server-generated merchant reference, idempotency key, provider identifier, provider status, verification result/timestamp, sanitized failure data, and timestamps. Persist multiple attempts for one order rather than overwriting the entire history.

Verify callback authentication and confirm the transaction with the provider as required. Match the merchant reference, order, amount, currency, environment and successful state before marking paid. A browser redirect, “success” message, request field, or unauthenticated callback cannot establish payment success.

Handle duplicate, delayed and out-of-order callbacks idempotently. Keep unique provider event/transaction identifiers. Payment success, order state, stock effects and event publication must be consistent. Use an outbox or equivalent retry-safe mechanism for updates after transaction commit. Reconcile pending attempts periodically if callbacks are missed.

Refunds require a real provider request with authorization, reason, amount limits, duplicate protection, processing/result state and reconciliation. Mark an order refunded only after the relevant refund result is confirmed. The existing `PaymentStatus` is a simplified projection; partial refunds and refund-in-progress need separate ledger data or a deliberate DTO/UI extension.

Replace the admin paid/refunded dropdown with appropriate read-only status plus payment/refund/reconciliation actions. If manual offline-payment recording is required later, make it a distinct permission, payment source, reason and audit entry; never label it provider-verified.

Gateway settings returned to browsers may contain `public_key`, `is_test_mode`, `merchant_name`, `currency`, enabled method metadata and configured/health indicators. Remove `secret_key` from shared frontend types and never return secret material, even to an admin browser. Store credentials and webhook secrets in private deployment configuration. Do not put secrets in `VITE_` values, source, logs, or seed files.

The payment screen must list actual attempts and statuses. Overview revenue must derive from verified transactions/orders under a documented definition; the present sum is gross paid order totals including delivery, not net revenue or settlement funds. Test/live records must be separable.

## 8. Customs requests and private tracking

### Intake and workflow

Support all existing form fields, arbitrary clothing-type text, one optional reference image, and a date-only preferred deadline. Required fields are full name, phone, email, clothing type, preferred color, deadline and design description; fit has the existing Men/Women/Unisex enum. Measurements and occasion are optional text; preserve their units and content without guessing numeric conversions.

Validate bounded lengths, contact formats, image ownership and date validity. Decide explicitly whether past dates are rejected and how workshop availability affects requested deadlines. A requested deadline is not an accepted delivery promise.

Generate a unique request ID/number, `NEW` status and server timestamp. Return the real stored record only after successful persistence. Submission should be retry-safe with a request idempotency key to avoid duplicates after uncertain network failures.

Store status history and enforce a transition policy across `NEW`, `CONTACTED`, `DESIGNING`, `APPROVED`, `IN PRODUCTION`, `READY`, `COMPLETED`, `CANCELLED`. Retain the exact spaced enum in the compatibility DTO. Record who changed status and when. Add an explicit cancelled display outside the linear progress bar.

Admin notes displayed to the customer are customer-visible data. Separate internal notes from public tailor notes if internal notes are introduced. The current UI only displays notes and supports a service parameter; an editor must be added to make note updates usable. `estimated_price` should be persisted if supported, but quotation editing/acceptance is an additional feature, not an existing one.

### Tracking authorization

Replace the public bulk list call with a single-record endpoint. Use customer ownership for signed-in requests or a high-entropy tracking token/verified contact flow for guests. A public sequential request number must not unlock name, phone, measurements, email, design references, or notes.

One compatible improvement is to return a one-time-visible tracking token/link after submission, show it on the success screen, and require it with the request number in the tracking UI. Store only an appropriate token hash, rate-limit lookup, and avoid leaking whether inaccessible request numbers exist. A contact OTP flow is an alternative requiring an actual message provider.

Return a dedicated tracking DTO with only fields the authorized customer needs. Full request enumeration and administrative/internal notes stay admin-only. Protect private reference images with the same ownership checks.

Subscribe the displayed request to scoped updates, or refetch/poll it. Keep the current submit-another form behavior and avoid clearing entered data on failure.

Customs currently ends at request/production tracking. Estimates, customer design approval, deposits, balance collection, fitting appointments and a linked retail order are optional business extensions requiring their own UI/contracts.

## 9. Events, dashboard, and operational behavior

Preserve the current event names and payload compatibility through the adapters: `product_created`, `product_updated`, `product_deleted`, `order_created`, `order_updated`, `custom_request_created`, `custom_request_updated`.

An SSE implementation must send messages consumed by `EventSource.onmessage` as JSON `{ type, data }`; exclusively named SSE events will not reach the current handler without a client change. Add event IDs/version metadata and replay/refetch behavior as needed.

Public listeners may receive safe catalogue events. Customers may receive only their own order/request events. Admins receive authorized store events. Guests need scoped tracking access; never stream full orders/customer contacts to anonymous visitors. Re-check stream authorization on connection/reconnection and handle session expiry/revocation.

Deduplicate local-success events and server echoes. Use upserts by record ID and ignore older versions. Update account order history and the active Customs tracking record, not only toasts/admin lists. Reconcile state after disconnection through a refetch or replay strategy. If SSE is not initially implemented, use explicit refetch/polling and remove unsupported “instant/live” claims.

For the admin dashboard, handle errors independently for catalogue/orders/requests/payment settings so one unavailable service does not wipe the entire screen. Show loading/empty/error/stale states truthfully. Sort recent records by server timestamp and preserve filters. Paginate protected lists when necessary without changing totals silently; an aggregate endpoint is optional if initial lists are small.

The admin can search registered customers and send an individual plain-text email through the server-configured Brevo provider. Attempts are idempotent and logged without storing message bodies; an uncertain provider response must be checked before starting a new attempt. Automatic signup, order-status, and abandoned-cart emails, bulk marketing, consent/preferences, and SMS/WhatsApp notifications are not implemented. Add those only with explicit trigger rules, consent where required, and durable queue/retry handling; a provider accepting a send is not proof of inbox delivery.

## 10. Suggested persistent data model

This model is logical and framework-neutral. A transactional relational database is a suitable baseline for the connected records and concurrency requirements. Choose the actual stack deliberately during implementation rather than treating browser interfaces as database tables.

| Entity | Core stored data and constraints |
| --- | --- |
| Customers | ID, name, normalized unique email, password hash/auth identity, state, timestamps |
| Admin identities | ID, credential/identity reference, permissions, state, timestamps; secure provisioning |
| Sessions | Session identifier/hash, principal/type, created/expiry/revoked times; no raw secret in API responses |
| Products | Current Product fields, unique SKU, publication/archive state, authoritative stock or inventory relation, version/timestamps |
| Product options | Sizes and named colors/hex values as constrained relations or validated structures; optional future variants |
| Media assets | Opaque ID, object key, owner/purpose, verified type/size/dimensions, public/private access, lifecycle timestamps |
| Carts / cart lines | Owner, version, product/size/color combination, positive integer quantity; unique line combination per cart |
| Wishlist entries | Owner + product unique pair, timestamps |
| Orders | Unique order number, nullable customer ID for guests, contact/delivery snapshots, totals/currency, fulfillment/payment projection, timestamps/version |
| Order items | Order ID, product reference plus immutable product name/image/option/price/quantity snapshot |
| Order timeline | Order ID, fulfillment state, timestamp, customer-facing title/description; related internal audit metadata |
| Inventory reservations | Order/product, reserved quantity, expiry and lifecycle status; idempotent release/commit |
| Stock movements | Product, delta, reason, order/reservation/admin reference, actor, timestamp, unique operation key |
| Payment attempts | Order, provider/method/environment, reference, amount/currency, status, verification fields, provider ID, idempotency and timestamps |
| Refunds | Payment/order, amount, reason, provider reference, state, actor and timestamps |
| Provider events | Unique event/deduplication key, minimal necessary payload, processing state, timestamps; restrict retention/access |
| Custom requests | All current request fields, nullable customer ID, private media reference, optional estimate, public tailor note, status, version/timestamps |
| Custom request history | Request ID, old/new status, actor, timestamp, public/internal notes as separate scopes |
| Tracking grants | Scoped order/request access token hash, permissions, expiry/revocation as appropriate |
| Checkout/request idempotency | Scoped key, request hash, state, result ID and expiry/retention policy |
| Non-secret store settings | Merchant/currency/method metadata and delivery rules; version and audit trail |
| Audit log | Administrative actor, action, target, timestamp, safe before/after metadata, reason/correlation ID |
| Event outbox / optional notifications | Committed event, audience, delivery status, retry schedule and deduplication ID |

Use database constraints for uniqueness, foreign keys and valid quantities; do not rely solely on UI validation. Index owner/order dates, request number, SKU, provider references and commonly filtered statuses. Keep secret credentials outside browser-readable configuration. Use UTC instants for stored events and date-only values for requested garment deadlines; format dates appropriately in the UI.

## 11. Frontend changes required alongside the backend

| File/area | Required change |
| --- | --- |
| `services/http.ts` | Preserve errors/credentials; add chosen CSRF behavior, structured errors and cancellation/retry policy where needed |
| `services/api.ts` | Add new safe contracts; keep explicit standalone demo mode; avoid displaying sample stock as real stock during a production API outage |
| `services/account.ts` | Separate request/response DTOs; add order refetch and reliable shopping persistence/merge support |
| `shared/types.ts` | Remove `secret_key` from client config; model safe create inputs, payment attempts, tracking DTO and versions as needed |
| `App.tsx` | Reliable login merge/acknowledgment, storage parse fallback, concurrent-save coordination, event upserts, fresh account orders/catalogue-backed cart data |
| `CheckoutModal.tsx` | Remove generated success/payment IDs; authoritative quote/order flow, payer number, stable guest/account idempotency, real payment or honest pay-later states |
| `CartDrawer.tsx` | Server-aware totals/availability and consistent delivery rule; maintain guest browsing |
| `AccountView.tsx` | Reflect actual payment states and refreshed history; add payment retry/pay-later action if supported |
| `CustomClothingView.tsx` | Single-request authorized tracking, access proof UI, stored upload reference, idempotent submit, live/refetched status, explicit cancellation |
| `AdminDashboardView.tsx` | Safe payment settings/ledger, remove arbitrary verification/refund selector, atomic inventory changes, per-section errors and honest health labels |
| Product editor | Preserve zero stock/price; preserve Culture gender; validate options/SKU; add controls if tagline/colors/featured/new flags must be editable |
| `ImagePlaceholder.tsx` | Upload to media service, validate input, await server result, show failed-upload state |
| Product detail / selected product state | Refresh options/quantity when selecting a different related item; avoid stale or invalid selections after catalogue changes |
| All affected consumers | Deduplicate mutation/SSE echoes; handle stale/deleted items and unauthorized/expired sessions |

The `/admin/settings` route is currently an empty shell. Either route it to the implemented payments/settings surface or remove the unused route from accepted tabs. A full general-settings page is optional; do not claim it already exists.

## 12. Acceptance checklist

### Catalogue, shopping, and accounts

- [ ] With no API configured, browsing/cart/wishlist still work; account/admin/checkout/request operations fail honestly without fabricating records.
- [ ] Published catalogue matches stored fields; all four collections, search, filters, sort, featured edit, related items, quick view and details still work.
- [ ] Creating/editing/archiving a product persists across service restarts and appears correctly to customers.
- [ ] Invalid SKU/options/negative prices or stock are rejected; zero stock is preserved in the editor.
- [ ] Product images survive reload; invalid or excessive uploads are rejected on the server.
- [ ] Customer signup/login/session/logout work; credentials are never returned or logged.
- [ ] Account A cannot retrieve or change account B's cart, wishlist, orders, requests, payments or private images.
- [ ] Guest-to-account merge does not lose items or double them on retry; a failed save preserves recoverable guest data.
- [ ] Cart/wishlist persist across devices for signed-in customers and survive reload; stale writes cannot resurrect a completed checkout cart.
- [ ] Deleted products, changed prices and out-of-stock items are explained before checkout; corrupted local storage does not crash the site.

### Checkout, payments, fulfillment, and stock

- [ ] Guest and account checkout persist real pending orders; empty carts and invalid quantities/options are rejected.
- [ ] Forged low prices/totals, successful statuses and provider IDs do not create a paid/discounted order.
- [ ] Delivery at 120,000 RWF and above the threshold matches the agreed server rule; destination limitations are explicit.
- [ ] Double submit, request timeout/retry, and page recovery return one order for the same checkout intent.
- [ ] Two concurrent buyers cannot purchase the same last unit; admin adjustments do not overwrite purchases or reservations.
- [ ] Supported provider sandbox card/mobile-money flows exercise success, pending, failure, cancellation and retry without fabricated payment success.
- [ ] Forged/mismatched callbacks are rejected; duplicate/out-of-order callbacks apply payment/stock effects once.
- [ ] Provider amount, currency, reference, environment and order are verified before marking paid.
- [ ] Reservation expiry and late payment success follow the documented reconciliation policy.
- [ ] Permitted fulfillment changes append timeline and audit records; invalid transitions fail.
- [ ] Cancellation/refund/restock behavior is tested independently; refunds reflect actual provider outcomes.
- [ ] Account history and confirmation reflect real server states, including unpaid saved orders and later payment.

### Customs, administration, and updates

- [ ] All existing Customs fields persist correctly, including optional measurements/occasion/image and arbitrary clothing types.
- [ ] Submission failure retains form data; retry does not create duplicate requests.
- [ ] A request can be tracked with authorized proof; guessing a request number cannot expose another customer.
- [ ] Anonymous/customer callers cannot list all requests or all store orders.
- [ ] A private reference image cannot be fetched with another user's media ID/token.
- [ ] Admin can review requests and change permitted statuses; cancellation displays correctly and customer-visible notes remain separate from internal notes.
- [ ] Admin privileges are enforced by the server even if the browser gate is bypassed.
- [ ] Dashboard counts/recent orders match committed records; transaction lists distinguish pending/failed/successful/refunded/test data.
- [ ] Gateway responses contain no secret key; saved fields are allowlisted and changes audited.
- [ ] SSE/refetch updates the right customer's order/request views without duplicates or private-data broadcasts.
- [ ] Logging out/expiring a session revokes protected operations and private live access.
- [ ] Network/service failures show honest retry/error states; one failed admin fetch does not blank all unrelated data.

### Delivery and operations

- [ ] Database migrations run on an empty database and support the documented upgrade path.
- [ ] Development seed is repeatable and does not create fake production payments or known public admin credentials.
- [ ] Configuration examples contain placeholders only; public frontend variables and server secrets are clearly separated.
- [ ] Health checks, structured/redacted logs, monitoring and backup/restore procedure are documented and exercised at an appropriate level.
- [ ] Static host fallback supports `/shop`, `/customs`, account routes and admin deep links.
- [ ] Existing frontend tests, typecheck and build pass; new backend permission, concurrency, payment and persistence tests pass.
- [ ] The delivery report maps every B01–B26 requirement to implementation and verification, with any external credential/deployment dependency clearly stated.

## 13. Delivery sequence and handoff

1. **Foundation:** choose the backend stack/database/storage, document decisions, define safe DTOs, create migrations/configuration/health checks, provision admin securely.
2. **Catalogue and identity:** product persistence/media, customer/admin sessions and authorization, seeded development catalogue, saved shopping and merge.
3. **Orders and inventory:** quotes, address validation, server pricing, idempotent guest/account orders, reservations, atomic stock, fulfillment/timelines.
4. **Payments:** provider sandbox integration, webhook verification, reconciliation, actual transaction ledger/refund behavior, corrected checkout/admin UI.
5. **Customs:** intake/uploads, private tracking, status/history, corrected customer/admin screens.
6. **Updates and deployment:** scoped events or polling, complete dashboard integration, outage handling, operational tests, deployment documentation and optional legacy migration.

Deliver source code, database schema/migrations, development seed, API documentation or OpenAPI contract, configuration examples, setup/run/deploy instructions, meaningful automated tests, and a B01–B26 coverage report. Preserve existing root frontend scripts or document new names clearly.

The current `.data/` files are sensitive migration candidates. Make migration opt-in, preview counts/mappings/conflicts, back up originals, and avoid silently importing plaintext demo credentials or simulated successful payments as live truth. Keep legacy references for reconciliation when records are migrated.

Business/provider decisions to record: actual Rwanda delivery coverage/fees, payment methods enabled for the merchant, pay-later policy and reservation duration, stock treatment of made-to-measure product sizes, cancellation/refund authority, and any customer notification channel. Use safe configurable development defaults where possible; never fabricate live merchant credentials or operational promises.

Optional future scope: recovery/verification/profile editing, address book, staff MFA/roles UI, variant stock, multi-image galleries, product deep links/SEO, content management, coupons, reviews, analytics, invoices, carrier integration, automated communications, customer returns, and Customs quotations/deposits/appointments. None should obscure completion of the current website's core flows.
