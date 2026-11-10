# AURIE website: current-state documentation

Snapshot: **4 November 2026**. This document describes the current working files in this repository, including uncommitted changes, rather than an older Git revision or an independently inspected deployed website.

Use this with [Backend requirements](backend-requirements.md) and the [AI backend build prompt](backend-ai-prompt.md). The first describes what exists; the second specifies what must be built; the third turns both into an implementation brief.

## 1. What the website is today

AURIE is a Rwanda-focused fashion storefront for menswear, womenswear, unisex clothing, cultural clothing, and custom-made garments. The brand shown to customers is **AURIE — Style With No Limits**. Some internal identifiers still use `lenos`, including the repository name, guest storage keys, and product SKUs.

The application is currently a **standalone React/Vite frontend**. The previous Express backend, authentication server, server scripts, and backend integration tests have been removed from the working tree. There is no active backend implementation in the source reviewed for this snapshot.

The pages retain service adapters for a replacement backend. Setting an API URL makes the frontend attempt those requests; it does not, by itself, provide authentication, a database, payment processing, inventory management, or secure tracking.

| Capability | Current state |
| --- | --- |
| Browse catalogue, collections, search, quick view, garment details | Works against eight sample products, or a configured catalogue API |
| Guest cart and wishlist | React state and browser local storage |
| Theme, navigation, filters, sorting, size guide | Frontend behavior |
| Customer registration, login, account history, saved shopping | UI and API calls exist; unavailable without a backend |
| Checkout | Unavailable without a backend; retained connected flow still contains payment simulation |
| Custom request form and image preview | Form works locally; submitting and tracking require a backend |
| Admin login and store management | Screens and API calls exist; unavailable without a backend |
| Real-time updates | Local event bus; optional credentialed server-sent events connection |
| Database, payment verification, uploads, notification delivery | No current server implementation |

### Evidence and verification

All current views, components, service modules, shared types, entry points, configuration, existing documentation, and service tests were reviewed. The baseline checks passed: `npm run typecheck`, `npm test` (3 tests), and `npm run build`.

Those tests check service behavior, including no unconfigured network calls and no fabricated successful writes on failure. They do not verify a replacement backend, a live payment provider, browser interactions, or production deployment. Existing ignored data files were identified by filename only; their contents and migration validity were not audited.

## 2. Technical structure

| Area | Current implementation |
| --- | --- |
| Rendering | React 19, TypeScript, React DOM, React Strict Mode |
| Build/development | Vite 8; source under `frontend/`; default dev port `5173` |
| Styling | Tailwind CSS 4, `index.css`, `aurie.css`, CSS theme variables |
| Icons | `lucide-react` |
| Routing | Custom pathname parsing and History API in `App.tsx`; no dedicated router |
| Shared data models | `shared/types.ts`, re-exported by `frontend/src/types/index.ts` |
| API transport | `frontend/src/services/http.ts`, using `fetch` with `credentials: 'include'` |
| Domain service functions | `frontend/src/services/api.ts` |
| Account transport | `frontend/src/services/account.ts` |
| Output | `frontend/dist`; static hosting requires an SPA fallback |
| Public configuration | Optional `VITE_API_BASE_URL` and `VITE_API_EVENTS_URL` |

`VITE_API_BASE_URL` is trimmed and trailing slashes are removed. An empty value disables account, admin, order, Customs, and settings operations. A nonempty value is only a configuration flag, not a health check. On a catalogue load failure, the app can retain sample products even when an API URL is configured.

`VITE_API_EVENTS_URL` is optional. The frontend opens an SSE connection only when both the API and events settings are present. No default events path is assumed by the current client.

The package manifest also contains dependencies such as `@google/genai`, `opencode-ai`, and `motion`; there is no implemented AI design, chatbot, or backend feature implied by those dependencies in the reviewed application code.

## 3. Page and navigation inventory

| Route or surface | Function | Backend dependency |
| --- | --- | --- |
| `/` | Home, collection navigation, featured edit, Customs promotion | Catalogue data only; marketing copy is static |
| `/shop` | Full catalogue | Product read |
| `/shop?category=Men`, `Women`, `Unisex`, `Culture` | Initial category filter | Same catalogue read |
| Product detail | Selected product shown in app state | Product data; no dedicated product URL today |
| `/customs` | Custom clothing request and tracking tabs | Submission and private tracking service |
| `/custom` | Alias of Customs | Same as above |
| `/login` | Customer login | Account authentication |
| `/signup` | Customer registration | Account creation |
| `/account` | Account summary, order history, read-only profile | Customer session, shopping, orders |
| `/admin`, `/admin/overview` | Admin session gate and overview | Admin authentication and store data |
| `/admin/products` | Product list, add/edit/delete, photos | Catalogue management and media storage |
| `/admin/orders` | Order management | Orders and fulfillment/payment controls |
| `/admin/custom` | Custom request management | Requests and status updates |
| `/admin/inventory` | Stock adjustment | Inventory writes |
| `/admin/payments` | Gateway settings and transaction-style list | Safe settings and payment data |
| `/admin/settings` | Recognized by route parser | **No settings screen or sidebar item is implemented** |
| Search, cart, wishlist, quick view, checkout, size guide | Overlays in the current page | Varies by operation; no separate URLs |

Browser back/forward updates the parsed route. Product selection changes React state without changing the URL, so a garment detail view cannot be bookmarked or restored by refreshing its current URL. Unknown customer paths fall back to the home view; no dedicated 404 screen is implemented. Category buttons inside the shop update local state rather than synchronizing every filter to the URL.

### Shared navigation and presentation

- Desktop navigation: Men, Women, Unisex, Culture, Customs, brand/home, search, login/account, wishlist, cart, theme switch.
- Mobile navigation: Shop all, all four collections, Customs, login/signup or account, wishlist, theme switch; menu can close with Escape.
- Cart badge counts total units; wishlist badge counts saved products.
- Footer: all collections, Customs, My account, My orders, Join Aurie, admin/storefront switch, Kigali location, current-year copyright.
- Storefront defaults to light mode and supports dark mode. Admin is forced to dark mode. Preference is stored under `aurie-theme` and synced between browser tabs through storage events.
- Hero and seasonal sections use plain backgrounds and live text. Collection and atelier images are placeholders. Previous generated campaign photos are absent.
- Page metadata is static: AURIE title, description, social metadata, SVG favicon, and Google Fonts loading. There is no per-product metadata generation.

## 4. Storefront functions

### 4.1 Home

The home page contains:

1. “Fashion that moves with you” hero, Shop now navigation, and an anchor link to the new-season section.
2. Collection tiles for Men, Women, and Culture. Unisex remains available through the main navigation and footer.
3. “New energy” seasonal promotion linking to all products.
4. Benefits copy covering Kigali origin, made-to-measure clothing, fabrics/cuts, and cards/mobile money.
5. “The AURIE Edit”: featured products first, followed by other products, limited to four.
6. Customs promotion and a Culture collection link.

There is no marketing-content editor or home-page CMS. Claims about payment and dispatch are copy, not evidence of working provider or delivery integrations.

### 4.2 Catalogue and filters

The shop loads the full product array and filters it in the browser:

- Categories: `All`, `Men`, `Women`, `Unisex`, `Culture`.
- Size filters: `All`, `XS`, `S`, `M`, `L`, `XL`, `XXL`.
- In-stock-only filter: `stock > 0`.
- Sorting: newest by `created_at`, ascending price, descending price.
- Result count, empty-results state, and reset of category/size/in-stock filters.
- Desktop and mobile filter controls.

`All` is a UI filter, not a valid stored product category. The catalogue has no pagination, server-side search, price-range filter, color filter, or subcategory filter UI.

### 4.3 Product cards and quick view

Product cards show image/placeholder, category, subcategory, name, RWF price, sizes, color swatches, wishlist toggle, quick view, and add-to-cart. A Culture product receives a Heritage badge; otherwise a new-arrival product can receive a New arrival badge.

Size and color default to the first option, with fallback values when arrays are empty. Add-to-cart adds one unit and is disabled for `stock <= 0`. Product title/image opens details. Quick view shows image, description, price, color and size selection, one-unit add-to-cart, and a link to full details; it supports close and Escape.

These actions all use the same cart and wishlist state. Selecting a color/size does not query variant-level availability because no variant inventory model currently exists.

### 4.4 Product details

The detail view includes:

- Product image, name, tagline, category, subcategory, SKU, RWF price, description, materials.
- Size/color choices, quantity, aggregate stock count, sold-out state.
- Add to Shopping Bag, Buy Now, wishlist toggle, Back to Collection.
- Static size-guide modal with S/M/L/XL chest, waist, and length guidance.
- Static delivery and payment assurance copy.
- Up to three related pieces from the same category, excluding the selected product.

Buy Now adds the chosen item to the existing cart and opens checkout for that cart; it is not a separate single-item order. The detail quantity increment attempts to cap at the product stock, but additions from different surfaces and cart increments can exceed it. Server stock validation is required.

The Culture sample includes `Custom / Made-to-measure` as a size. Choosing it currently follows ordinary product checkout: it does not collect measurements or create a Customs request automatically.

### 4.5 Search

Search is a browser-side, case-insensitive substring search of product name, category, subcategory, description, and optional tagline. Blank searches show no results. Popular suggestions are static: Blazer, Traditional, Umushanana, Tee, Hoodie, Dress, Trousers.

Results show product image/placeholder, category/subcategory, name, and price. Selecting one opens its detail view. Search supports close, Escape, backdrop close, and Home navigation. No query analytics or search service exists.

### 4.6 Cart

Cart rows are identified by product ID + selected size + selected color name. Adding a matching row increases quantity; another size or color creates a separate row. The cart drawer supports increment, decrement, removal, empty state, item totals, subtotal, delivery estimate, total, and checkout.

Guest carts store complete product snapshots under `lenos_cart`. There is no server-side guest cart today. Increasing cart quantity has no stock cap. Decrementing to zero removes the row.

Current displayed delivery rule: **2,500 RWF unless subtotal is strictly greater than 120,000 RWF**, in which case it is free. At exactly 120,000 RWF, delivery is still 2,500 RWF. The empty cart calculates zero delivery, while checkout's calculation does not special-case an empty cart. Checkout submission is disabled when the cart is empty. No tax or discount calculation exists.

### 4.7 Wishlist

Wishlist operations add/remove a product by ID, display saved product cards, open garment details, remove individual items, and show a count and empty state. Guests persist complete product objects under `lenos_wishlist`. There is no direct wishlist-to-cart button; the user opens product details first.

## 5. Customer accounts and shopping persistence

Without an API URL, the account routes display an unavailable/coming-soon screen and a shopping link.

With a backend configured:

| Function | Current client behavior |
| --- | --- |
| Register | Sends `name`, `email`, `password` to account signup |
| Login | Sends `email`, `password` to account login |
| Form validation | Name required on signup, max 100 characters; email required, max 254; password 12–128 characters in both forms |
| Restore session | On app mount, fetches session and hydrates customer, cart, wishlist, orders |
| Guest session | Expects `{ customer: null }` |
| Successful authentication | Expects `{ customer, cart, wishlist, orders }` |
| Merge guest shopping | Combines server and in-memory cart by product/size/color; caps matching-row quantity at 99; unions wishlists by product ID |
| Save shopping | Debounced 400 ms `PUT` of the complete cart and wishlist for a signed-in customer |
| Logout | Saves shopping first, calls logout, clears current customer/order/cart/wishlist state, closes checkout, returns home |
| Order summary | Counts orders; opens order history, cart, and wishlist |
| Order history | Shows number, date, status/payment label, total, item variants/quantities, delivery address, timeline text |
| Profile | Read-only name/email; says delivery address is collected during checkout |

Guest storage keys are removed immediately after successful authentication in the current merge flow. Automatic session restoration replaces shopping state with the server account data rather than performing the explicit-login merge. These details need reconciliation when reliable server persistence is added.

Orders in account state are initially loaded from the session/login response and prepended after account checkout. The global `order_updated` listener currently shows a toast but does **not** update the account order list. There is no implemented client call to `GET /api/account/orders` and no payment retry button.

Profile editing, password reset/change, email verification, address book, customer account deletion, social login, customer cancellation, and customer refunds have no current UI or service workflow.

## 6. Checkout and payment behavior

### 6.1 Collected fields

| Field | Client behavior |
| --- | --- |
| Full name, email | Required; initialized from signed-in customer when available |
| Phone | Required; starts with a `+250 78` example prefix; not robustly validated |
| Province | Select: Kigali City, Northern, Southern, Eastern, Western Province |
| District | Required free text; default Gasabo |
| Sector & Cell | Required free text stored as one `delivery_sector`; default Kimihurura |
| Street/house/landmark | Required free text |
| Delivery instructions | Optional text |
| Payment choice | Rwanda Mobile Money (`flutterwave_momo`) or card (`flutterwave_card`) |
| MoMo number | Additional input in the guest simulated payment screen; defaults visually to delivery phone |

The shared type additionally allows `airtel_money`, but the checkout has no separate Airtel choice. The Mobile Money label mentions MTN and Airtel. Actual provider support is not established by this UI and must be verified when integrating the provider.

### 6.2 Current paths when an API is configured

**Guest:** delivery form → simulated payment screen → `POST /api/orders` → demo confirmation → cart cleared after a successful API response.

**Signed in:** delivery form → `POST /api/account/orders` with a `checkout_key` UUID → “saved / awaiting payment” confirmation → order added to account state → cart cleared after a successful API response.

Both paths currently construct the same unsafe browser payload containing item prices, totals, `status: 'CONFIRMED'`, `payment_status: 'SUCCESSFUL'`, a fabricated reference, and a random Flutterwave transaction ID. The signed-in copy says unpaid, but the outgoing fields say successful. A replacement backend must establish the truth and the frontend must be corrected to render it.

No provider checkout, USSD request, card tokenization, server verification, webhook, refund, or actual charge occurs in the current code. The MoMo input is not included in the outgoing order payload. Card fields are disabled sample values. Processing labels that mention verification are presentational.

Guest checkout currently sends no idempotency key. The account key resets after closing checkout. These are important gaps for retries, interrupted requests, and duplicate prevention.

## 7. Customs: made-to-measure requests

The Customs page explains three stages: share an idea, discuss design/measurements/price/timing, then follow production. Two tabs provide request submission and request tracking. When unconfigured, the form remains browsable but submit/search are disabled and an unavailable notice is shown.

### 7.1 Request fields

| Field | Required by UI? | Current values/behavior |
| --- | --- | --- |
| Full name | Yes | Text |
| Phone / WhatsApp | Yes | Text/telephone; `+250` guidance |
| Email | Yes | Email input |
| Fit / collection | Default selected | Men, Women, Unisex; default Unisex |
| Clothing type | Yes | Free text with suggestions, not a closed enum |
| Preferred color / palette | Yes | Free text |
| Occasion | No | Free text |
| Preferred completion deadline | Yes | Date input; no future-date restriction currently |
| Measurements or standard sizes | No | Free text supporting inches/cm or an atelier fitting note |
| Design idea | Yes | Textarea |
| Reference image/sketch | No | One JPEG, PNG, or WebP, up to 5 MB, converted to a data URL |

Clothing suggestions: Shirt / Top, Dress, Suit, Trousers / Skirt, Matching Set, Jacket / Hoodie, Cultural / Traditional Wear. Customers may enter another garment idea.

Image controls include reading state, preview, removal, and validation error. The browser sends the image inside JSON, not as a separately stored file. There is no object storage integration.

### 7.2 Submission result

Submission calls `POST /api/custom-requests`. On success the UI shows customer name, phone, request number, garment, and status. It can jump to tracking using the returned record or start another request. Starting another request resets garment/design fields and attachment but retains contact information and fit selection. Failure retains form details and shows an error.

### 7.3 Tracking

The current lookup downloads `GET /api/custom-requests` and searches the array in the browser using a trimmed, case-insensitive request number with `#` removed. **This must be replaced before production: a public list would expose other customers' records.**

The result shows request number, garment, current stage, progress bar, client name/phone, occasion, color, deadline, and tailor note. The pipeline is:

`NEW → CONTACTED → DESIGNING → APPROVED → IN PRODUCTION → READY → COMPLETED`

`CANCELLED` is supported by the data type and admin selector but is absent from the progress-bar stages. Tracking does not subscribe to request update events; a displayed record can become stale. A request number alone should not authorize access to personal data.

There is no customer design approval button, quotation acceptance, Customs checkout/deposit, appointment booking, message thread, or link from Customs into account history. `estimated_price` exists in the shared type but has no implemented editor or display in these views.

## 8. Admin functions

### 8.1 Access and general controls

The admin UI uses a password-only form. It checks `GET /api/admin/session`, posts `{ password }` to login, and posts to logout. The session response uses `authenticated`. Current successful login handling treats a successful HTTP response as authenticated, so a rejected login must not return success.

The UI gate is not authorization. Every protected backend route and private event must enforce admin permissions independently. No admin provisioning, individual staff accounts, roles editor, MFA, or password-change screen exists.

General controls include desktop/mobile sidebar, tab navigation, refresh, customer storefront link, and Lock Admin Portal. Refresh loads products, orders, Customs, and gateway settings together with `Promise.all`. Failure of one can prevent all four datasets being populated. Logout hides the dashboard even if the logout network request fails.

### 8.2 Overview

- Total Revenue: sum of `order.total` where `payment_status === 'SUCCESSFUL'`; includes delivery in the total and is not a settlement or net-revenue report.
- Total Orders: number of loaded orders.
- Dispatch-pipeline count: orders with status `PENDING` or `CONFIRMED` only.
- Active Bespoke Requests: requests except `COMPLETED` and `CANCELLED`.
- Garment designs: number of products; low-stock count: products with `stock < 10`.
- Recent orders: first five entries in the supplied order array, with contact/destination, total, payment badge, fulfillment dropdown, and detail modal.
- View all orders and manual refresh.

“Live Store Engine Active,” “Verified via Flutterwave,” and instant-tracking claims are fixed labels, not health/verification checks. List ordering must be supplied consistently by the backend if “recent” is to be accurate.

### 8.3 Product management

The products tab supports category filtering, name substring search, creation, editing, deletion with confirmation, inline image URL replacement, and local file upload through the image component. The table shows photo, name/SKU, featured badge, category, price, sizes, and stock.

The create/edit form exposes name, SKU, category, subcategory, price, stock, comma-separated sizes, image URL, description, and materials. It parses sizes into an array and derives gender from category: Men → men, Women → women, all others → unisex.

Important limitations:

- Tagline, featured flag, and new-arrival flag are retained in state and sent, but have no visible editing controls.
- Colors have no editor. Existing colors are preserved; new products default to Obsidian Black and Pure Chalk.
- New featured/new-arrival values default to true.
- New SKU is based on a short time suffix and is not guaranteed unique.
- The form uses `||` for stock and price defaults, so editing a zero-stock product initializes stock as 15; a zero price initializes as 85,000.
- The modal's label mentions upload, but its own field is only a URL textbox; file upload is in the inline table image control.
- Inline product uploads use an unrestricted `image/*` picker and data URL conversion, with no implemented size/type validation comparable to Customs.
- All product inventory is one aggregate number; there is no per-size/color stock editor or image gallery.

### 8.4 Orders and detail modal

The orders table filters by All or any fulfillment status, and shows number, date, name, phone, Rwanda delivery destination, total, payment status selector, fulfillment status selector, and View action.

Fulfillment choices: `PENDING`, `CONFIRMED`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`.

Payment choices: `SUCCESSFUL`, `PENDING`, `FAILED`, `REFUNDED`. These currently call the same status-update endpoint. Setting a dropdown to REFUNDED is not a provider refund. Verified electronic payment status must be controlled by payment processing, with any manual exception separately authorized and audited.

The detail modal shows date, fulfillment control, customer name/email/phone, full delivery fields/notes, items with size/color/quantity/line totals, and order total. It has no carrier integration, tracking-number input, editable address, invoice download, delete-order action, or returns workflow. The service accepts a timeline note, but the UI has no note editor.

### 8.5 Customs management

Admins see request cards with request number, garment, customer name/phone, status selector, occasion/deadline, color, measurements/fitting fallback, description, image, and existing tailor note.

All eight Customs statuses are selectable. The service accepts updated notes, but the screen currently has no note input. There is no estimated-price editor, request edit/delete action, request search/filter, staff assignment, notification action, or customer approval collection.

### 8.6 Inventory

Inventory cards show name, SKU, category, price, aggregate units, and `−1`, `+1`, `+5` controls. Each calculates an absolute stock value in the browser, clamps it at zero, and sends a product update. Concurrent admin updates or purchases can overwrite one another unless the backend and client adopt atomic adjustment or version checks.

The low-stock count uses `< 10`; some visual stock indicators treat exactly 10 as a warning too. These thresholds need consistent definitions.

### 8.7 Payments and gateway settings

Editable fields shown are public key, sandbox/test-mode checkbox, and merchant name. The save operation posts the entire loaded config object. The shared `FlutterwaveConfig` type also contains `secret_key` and `currency`; there is **no visible secret-key input in the current screen**, despite older README wording about removing such fields.

The backend must never return a secret in that object. Remove `secret_key` from the browser contract and save only allowlisted non-secret fields. Private credentials belong in server configuration.

“Recent Verified Flutterwave Transactions” currently renders **every order**, without filtering on verification/payment status. Rows show order number, customer, reference, amount, and payment method. There is no dedicated payment-attempt ledger, provider connection test, payout report, settlement report, or refund action.

## 9. Events and storage

The current event names are:

| Event | Data | Current consumers |
| --- | --- | --- |
| `product_created` | Product | Root storefront inserts it |
| `product_updated` | Product | Root storefront replaces matching catalogue item |
| `product_deleted` | `{ id }` | Root storefront removes it |
| `order_created` | Order | Admin inserts it |
| `order_updated` | Order | Admin updates record/detail; storefront shows toast |
| `custom_request_created` | CustomClothingRequest | Admin inserts it |
| `custom_request_updated` | CustomClothingRequest | Admin replaces matching record |

Service mutations emit local events after a successful HTTP response. Optional SSE messages are parsed as `{ "type": "event_name", "data": ... }` and forwarded into the same event bus. An SSE echo can duplicate a locally inserted record. No event ID, replay logic, reconnect reconciliation, stream health state, or audience authorization is implemented in the frontend. Admin subscriptions can be registered while its UI is unauthenticated, so the server must filter every event by the actual session.

Guest cart and wishlist contain full product snapshots and can become stale after product changes. Corrupted cart/wishlist JSON is not caught during initialization. Theme parsing/storage is more defensive. No current service reads old cached backend records.

Ignored `.data/` files are preserved: `customers.json`, `demo-login.json`, and `legacy-backend-export.json`. These are potential migration inputs, not the current database. Do not publish their contents, import credentials blindly, or infer verified payment history from legacy simulated orders.

## 10. Exact data shapes consumed by the frontend

These are browser response models, not a recommended database schema. `?` means optional in the TypeScript definition. Some string fields are required by the type even when their form input is optional and sends an empty string.

| Model | Fields |
| --- | --- |
| `ProductColor` | `name: string`, `hex: string` |
| `Product` | `id`, `name`, `tagline?`, `category`, `subcategory`, `price: number`, `image_url?`, `description`, `materials?`, `sizes: string[]`, `colors: ProductColor[]`, `stock: number`, `sku`, `gender`, `is_featured: boolean`, `is_new_arrival: boolean`, `created_at` |
| `CartItem` | `product: Product`, `selectedSize: string`, `selectedColor: ProductColor`, `quantity: number` |
| `Customer` | `id: string`, `name: string`, `email: string` |
| `Account` | `customer: Customer`, `cart: CartItem[]`, `wishlist: Product[]`, `orders: Order[]` |
| `OrderItem` | `product_id`, `product_name`, `product_image?`, `size`, `color`, `quantity: number`, `price: number` |
| `OrderTimelineEvent` | `status: OrderStatus`, `timestamp`, `title`, `description` |
| `Order` | `id`, `order_number`, `customer_name`, `customer_email`, `customer_phone`, `delivery_province`, `delivery_district`, `delivery_sector`, `delivery_street`, `delivery_notes?`, `items: OrderItem[]`, `subtotal: number`, `delivery_fee: number`, `total: number`, `currency: 'RWF'`, `status`, `payment_status`, `payment_method`, `transaction_reference`, `flutterwave_tx_id?`, `created_at`, `updated_at`, `timeline: OrderTimelineEvent[]` |
| `CustomClothingRequest` | `id`, `request_number`, `full_name`, `phone`, `email`, `gender: 'Men'/'Women'/'Unisex'`, `clothing_type`, `preferred_color`, `measurements`, `occasion`, `description`, `reference_image?`, `preferred_deadline`, `status`, `estimated_price?: number`, `notes?`, `created_at` |
| Legacy `FlutterwaveConfig` | `public_key: string`, `secret_key: string` (must be removed from client contract), `is_test_mode: boolean`, `merchant_name: string`, `currency: string` |

All unannotated fields above are strings except the status enums. Product categories exclude `All`; product gender uses lowercase `men/women/unisex`, while Customs gender uses capitalized `Men/Women/Unisex`. `IN PRODUCTION` contains a space. Preserve these differences in API adapters.

### Sample catalogue

All eight sample image URLs are empty. Sample `created_at` values are generated when the module loads, not historical creation dates.

| ID | Product | Category / subcategory | Price RWF | Stock | SKU | Featured / new |
| --- | --- | --- | ---: | ---: | --- | --- |
| prod-001 | Obsidian Minimal Blazer | Men / Jackets | 125,000 | 14 | LEN-M-BLZ-001 | Yes / Yes |
| prod-002 | Tailored Poplin Mandarin Shirt | Men / Shirts | 58,000 | 22 | LEN-M-SHT-002 | No / Yes |
| prod-003 | Sculptural Asymmetric Evening Gown | Women / Dresses | 145,000 | 9 | LEN-W-DRS-003 | Yes / Yes |
| prod-004 | Fluid Wide-Leg Tailored Trousers | Women / Trousers | 78,000 | 18 | LEN-W-TRS-004 | No / No |
| prod-005 | "STYLE WITH NO LIMITS" Heavyweight Tee | Unisex / T-Shirts | 42,000 | 35 | LEN-U-TEE-005 | Yes / Yes |
| prod-006 | Architectural Boxy Hoodie | Unisex / Hoodies | 92,000 | 12 | LEN-U-HOD-006 | No / Yes |
| prod-007 | Modern Umushanana Cultural Ensemble | Culture / Complete traditional outfits | 185,000 | 6 | LEN-C-MSH-007 | Yes / Yes |
| prod-008 | Rwandan Imigongo-Inspired Embroidered Tunic | Culture / Traditional shirts | 110,000 | 8 | LEN-C-TNC-008 | Yes / No |

The exact sample descriptions, taglines, materials, sizes, and named color/hex combinations remain in `INITIAL_PRODUCTS` in `frontend/src/services/api.ts`; copy that dataset for a development seed rather than reconstructing those values from this summary.

## 11. Functions that do not currently exist

These must not be described as already implemented: promotions/coupons, gift cards, subscriptions, product reviews/ratings, newsletter signup, contact form, live chat, customer profile editing, saved addresses, password recovery, email verification, staff account management, carrier tracking, tax engine, invoice/PDF generation, returns portal, refunds processing, customer design approval, Customs deposits, CMS, analytics service, multi-currency, localization, or AI design generation.

Some are useful future improvements; they are separately marked as additions in the backend requirements. Static copy about a future capability does not mean its backend exists.

## 12. Source map for implementation

| Files | Responsibility |
| --- | --- |
| `frontend/src/App.tsx` | Routing, catalogue, cart/wishlist state, session bootstrap/merge, overlays, events |
| `frontend/src/services/http.ts` | Configuration, HTTP transport, error handling |
| `frontend/src/services/api.ts` | Eight sample products, domain API functions, event bus/SSE |
| `frontend/src/services/account.ts` | Customer/account types and account request helper |
| `shared/types.ts`, `frontend/src/types/index.ts` | Shared response types and re-export |
| `frontend/src/views/HomeView.tsx`, `components/FashionHero.tsx` | Home content and featured selection |
| `frontend/src/views/ShopView.tsx`, `components/SearchModal.tsx` | Catalogue filters/sorting and search |
| `frontend/src/components/ProductCard.tsx`, `QuickViewModal.tsx` | Product choices and quick shopping |
| `frontend/src/views/ProductDetailView.tsx` | Details, size guide, quantity, related items, Buy Now |
| `frontend/src/components/CartDrawer.tsx`, `WishlistDrawer.tsx` | Shopping overlays |
| `frontend/src/components/CheckoutModal.tsx` | Address collection, order payload, simulated payment |
| `frontend/src/views/AccountView.tsx` | Login/signup, profile, account order display |
| `frontend/src/views/CustomClothingView.tsx` | Customs form, attachment preview, request tracking |
| `frontend/src/views/AdminDashboardView.tsx` | Admin gate, all management tabs, product/order modals |
| `frontend/src/components/ImagePlaceholder.tsx` | Product images, URL/file selection, data URL conversion |
| `frontend/src/components/Navbar.tsx`, `Footer.tsx` | Shared navigation |
| `frontend/src/useTheme.ts`, `index.css`, `aurie.css` | Theme and presentation |
| `frontend/src/main.tsx`, `frontend/index.html` | App entry, theme bootstrap, metadata |
| `frontend/vite.config.ts`, `.env.example`, root `package.json` | Build, public settings, scripts |
| `tests/frontendServices.test.mjs` | Existing service behavior tests |
| `docs/aurie-campaign.md` | Current photo-placeholder guidance |

The next document maps these functions to concrete backend work and acceptance criteria: [Backend requirements](backend-requirements.md).
