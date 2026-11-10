# Test the API in Swagger

1. Start the API and open `http://localhost:3000/docs/`.
2. Click **Authorize**. In **AppClient**, enter `web`, authorize, and close the dialog. Leave cookie schemes empty; login operations set browser cookies.
3. Expand `GET /api/products`, click **Try it out → Execute**. It returns the full stored catalogue.
4. For an account, execute `POST /api/account/signup` with your name, a test email and a unique 12+ character password. `GET /api/account/session` then shows your account and `shopping_version`. Logout before testing a guest flow, because the server derives ownership from the current cookie.

## Guest order

Generate an idempotency key and private token in PowerShell; retain both until the request outcome is known:

```powershell
[guid]::NewGuid().ToString()
[Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
```

Execute `POST /api/checkout/quote`:

```json
{
  "items": [{"product_id":"prod-001","size":"S","color":"Obsidian Black","quantity":1}],
  "delivery_province":"Kigali"
}
```

Copy the returned `quote_fingerprint`. Execute `POST /api/orders`, setting the `Idempotency-Key` header to your UUID and filling this body with the fingerprint/private token:

```json
{
  "customer_name":"Your test customer",
  "customer_email":"test@example.com",
  "customer_phone":"+250788123456",
  "delivery_province":"Kigali",
  "delivery_district":"Gasabo",
  "delivery_sector":"Kimironko",
  "delivery_street":"Test address",
  "items":[{"product_id":"prod-001","size":"S","color":"Obsidian Black","quantity":1}],
  "quote_fingerprint":"PASTE_THE_QUOTE_FINGERPRINT",
  "access_token":"PASTE_YOUR_64_CHARACTER_PRIVATE_TOKEN"
}
```

Expect a real stored order with `status: PENDING`, `payment_status: PENDING`, server totals and timeline. Repeat the same key/body: the same order ID is returned. Changing the body with that key returns 409. Save its ID and token; `GET /api/orders/{id}` accepts the token in `X-Order-Token`. Anonymous `GET /api/orders` remains forbidden.

Payment initiation is separate and returns 503 when merchant credentials are absent. This is deliberate: an unpaid order never becomes a pretend successful payment. Configure and test Flutterwave sandbox before attempting payment-session endpoints.

## Admin and images

Provision an admin using the README's private credential-file workflow, then execute `POST /api/admin/login`. Use email/password when multiple admins exist. Product edits require `expected_version` from the current product response. Inventory buttons/API use delta adjustments with reason and idempotency key. Payment status cannot be set through an order-status request.

For product images, log in as admin and use `POST /api/uploads?purpose=product` with Swagger's file picker. For Customs references use `purpose=custom`; retain `media_id` and `upload_token`, then attach those fields to the custom request. Product images are public; private references require the owner session, temporary upload proof before attachment, or the bound guest tracking token afterward.

Customs submissions require their own stable `Idempotency-Key` and guest `access_token`. Track only through `POST /api/custom-requests/track`, sending `request_number` and that token. The full list stays admin-only. Wrong or missing proof returns the same inaccessible-record response.
