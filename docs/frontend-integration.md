# Storefront integration

The source of truth was the existing uncommitted state in `C:/Users/ccely/lenos-v1`. No Git reset, checkout, legacy data import, or restoration of deleted backend code was used.

Changes:

- `services/http.ts`: credentialed requests, custom CSRF header, bounded request duration and structured API errors.
- `services/checkout.ts`: safe request DTO adapters, cryptographic guest tokens, persistent checkout intents and multipart upload transport.
- `services/api.ts`: scoped event polling, version-aware upserts, atomic inventory adapter, server version fields, allowlisted gateway settings and protected Customs APIs.
- `services/account.ts` / `App.tsx`: canonical saved-shopping versions, serialized saves, retry-safe guest merge, conflict recovery, logout independent of failed save, no sample fallback during configured catalogue failure, refreshed account orders.
- `CheckoutModal.tsx`: server quote review; persisted pending order; stable request/body/token across timeout/reload; configured methods only; payer number; hosted card redirect; pending/retry/reconcile; no fabricated transaction IDs or successful payment flags.
- `CustomClothingView.tsx`: private upload then persisted intake; idempotent recovery; single-request tracking proof; polling and cancellation display; requested-date caveat.
- `AdminDashboardView.tsx`, `PaymentsPanel.tsx`, `AdminEmailPanel.tsx`: independent fetch errors, honest update labels, read-only payment truth, real attempt/refund ledger, atomic inventory, customer email lookup and individual plain-text sends, `/admin/settings` routes to the implemented payments/settings surface.
- `ImagePlaceholder.tsx`, `PrivateImage.tsx`: durable product uploads and authenticated private reference fetches.
- `AccountView.tsx`: resume payment and recover saved shopping.
- `shared/types.ts`: versions and safe payment/settings metadata; removed browser `secret_key`.

Guest cart identity remains product ID + size + color name. Wishlist identity remains product ID. Legacy `lenos_cart` and `lenos_wishlist` keys are retained. Guest keys are cleared only after the server acknowledges merge. Conflicting account edits are retained in `aurie_unsaved_<customerId>` for deliberate recovery rather than automatically overwriting newer server state.

Buy Now still adds to the complete bag. Prices in the bag remain estimates; the server quote is shown before placing an order. Saved order and request access tokens are sensitive browser-local grants. Do not add them to URLs, logs or analytics.

Polling envelopes use the existing event names and `{ type, data }`, with cursor/version metadata. On authentication, account/admin snapshots hydrate their current permitted data. Each poll revalidates sessions. Upserts handle mutation/echo duplicates. Active Customs lookups are separately reauthorized on every refresh. Public events contain catalogue records only.

Deployment should serve the frontend with an SPA fallback to `index.html` for `/shop`, `/customs`, `/account` and admin deep links. `VITE_API_BASE_URL` is a public build-time setting, not a service health indicator. `VITE_API_EVENTS_URL` stays blank because this integration uses polling.
