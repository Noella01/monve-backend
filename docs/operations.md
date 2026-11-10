# Operations and launch checklist

## Configuration and topology

The repository has separate server `.env.example` and frontend `frontend.env.example`. Backend secrets belong only on the API host. The Docker image excludes environment files, `.runtime`, `.data`, frontend staging and backups. The compose port is loopback-only for use behind a reverse proxy. Set exact origins and HTTPS cookie settings in production; startup rejects insecure production URLs/cookies. `trustProxy` is false, so rate limits use the connection address. A same-host reverse proxy may share an IP; configure a carefully restricted trusted proxy in code if you need per-client limits behind it, never unrestricted forwarded-header trust.

Run one API process/replica on a persistent local filesystem. Database migrations run before accepting requests and are transactional/versioned. The current schema is `migrations/001_initial.sql`; do not edit it after deployment. Add numbered forward migrations and test them against a restored backup. SQLite supports one writer at a time; migrate to PostgreSQL and object storage before horizontal scaling.

The periodic worker runs every 15 seconds, releases expired reservations, removes abandoned media, processes authenticated provider events and reconciles unsettled payment/refund attempts. Every operation records durable state before calling an external provider. An uncertain charge/refund is retained for reconciliation, never claimed successful. Event polling reads committed database state; there is no in-memory private event broadcast.

## Health and logs

- `/health/live`: process liveness.
- `/health/ready`: database readiness and truthful payment configuration status.
- Admin payment ledger: `UNKNOWN` attempts/refunds, pending provider IDs, verified timestamps and test/live separation.
- Admin overview: orders requiring review after late/double payment.
- `/api/admin/audit`: latest administrative actions with actor, target, timestamps and bounded details.

Logs omit request bodies and redact cookies, authorization, access tokens and webhook authentication. Do not enable provider response/body logging: responses can contain customer/card metadata. Monitor 5xx/429 rates, readiness, disk space, reservation backlog, provider events reaching their retry limit, unpaid/UNKNOWN attempts and refunds. Add centralized alerting appropriate to the selected host. No external monitoring account is assumed or provisioned.

## Administrator inside Docker

The container has its own database in the named volume; an administrator provisioned into the local `.runtime` database is not automatically copied there. Prepare the private JSON credential file described in the README, then run the compiled CLI against the container volume. In PowerShell:

```powershell
$adminInputPath = (Resolve-Path .runtime/admin-input.json).Path
docker compose run --rm --no-deps -e ADMIN_CREDENTIAL_FILE=/run/admin.json --volume "${adminInputPath}:/run/admin.json:ro" api node --experimental-sqlite dist/scripts/manage.js admin
Remove-Item -LiteralPath .runtime/admin-input.json
```

Only remove the input file after successful provisioning. No password appears in command arguments. The one-off command shares the API's named data volume and deployment environment. For a development container only, populate the sample catalogue with `docker compose exec api node --experimental-sqlite dist/scripts/manage.js seed`; production seeding is deliberately disabled.

## Backup and restore

Local consistent DB snapshot:

```powershell
npm run db:backup -- backups/aurie.sqlite
```

This uses SQLite `VACUUM INTO`, not an unsafe copy of an active WAL database. Back up the uploads directory too. For a consistent DB+media set, pause writes during the snapshot/upload copy (a short maintenance window), then restart. Encrypt backup storage and restrict access because orders, sessions and Customs contain personal information. Keep secrets separately in your secret manager.

Container snapshot uses the compiled CLI:

```text
docker compose exec api node --experimental-sqlite dist/scripts/manage.js backup /data/aurie-backup.sqlite
```

Copy that snapshot and `/data/uploads` to your protected backup storage. Do not use `docker compose down -v` unless you deliberately intend to destroy the database and images.

Restore into a new empty directory/volume while the service is stopped. Preserve the original volume until verification. Place the snapshot at the configured `DATABASE_PATH`, restore matching uploads, and give the runtime user read/write access. Start with outgoing payment methods disabled until the restored environment/reference history is reconciled. Check readiness, product counts, admin/customer sessions (or revoke all sessions), a protected order, a private image and inventory totals before accepting traffic. Restoring old payment state can cause reconciliation conflicts; do not blindly resubmit uncertain attempts/refunds.

Integration tests reopen a persistent database through a second service and verify the same order; backup CLI and restore checks are separately recorded in the delivery report.

## Provider sandbox acceptance

Before live use, configure the merchant's actual sandbox credentials/account ID and enable only approved RWF methods. Verify each in the running storefront:

1. Hosted card success, decline, abandoned checkout and return navigation.
2. Rwanda mobile-money pending, customer authorization, failure and retry using the payer's number.
3. Correct reference/amount/currency/account; test/live keys must not be swapped for existing attempts.
4. A real authenticated webhook reaches the API, is queued, and provider verification confirms its transaction. Retry the callback and verify one stock movement.
5. Miss a callback and verify background reconciliation updates the same order.
6. Expire a reservation; verify late success either reacquires all stock or blocks dispatch pending refund review.
7. Full/partial refund initiation, pending ledger and final disbursement status. Flutterwave `completed` alone does not mean the customer has received funds.
8. For an unknown refund initiation, look it up in the provider dashboard and reconcile its exact transaction/amount. Do not submit another refund while the outcome is uncertain.

Use no real charges to perform these checks. Local automated mocks establish application invariants and adapter request shapes; they do not establish provider availability, merchant eligibility or approved MTN/Airtel methods.

## Legacy data

The frontend's ignored `.data/customers.json`, `demo-login.json` and `legacy-backend-export.json` were not read, modified or imported. Migration is opt-in: back up originals, inspect counts/schema without printing personal data, map IDs/SKUs/statuses, resolve duplicates, obtain business approval for stock and order truth, run a dry-run report, then import transactionally with legacy reference IDs. Do not import plaintext demo passwords or call old simulated successful payments verified. New users should establish fresh credentials. Keep any migrated unverified money explicitly separate from verified provider records.

## Pending business decisions

Confirm Rwanda-wide delivery coverage and fees; merchant payment-method enablement; whether unpaid saved orders are desired; reservation duration; made-to-measure retail stock treatment; cancellation/refund operator authority; and whether staff contact remains manual. There is no automatic promise of delivery, customer notification, quoted Customs price acceptance, or production completion by the requested date.
