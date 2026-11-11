# Backend deployment handoff

The API is packaged as a Docker service. Deploy it to a host that supports a persistent disk or volume mounted at `/data`, and run exactly one API replica while it uses SQLite. The database and uploaded images both live on that volume. Do not deploy this service to an ephemeral filesystem or horizontally scale it.

## Keep local development separate

- The backend's root `.env` is local development configuration. Keep using `.env.example` for its localhost defaults; `npm run dev` loads this file.
- The staged frontend uses `integration/lenos-v1/.env.local` for local Vite settings. Its local API URL is `http://localhost:3000`. `frontend.env.example` shows these local frontend values. Keep this file local and uncommitted.
- Production settings belong in the backend host's environment settings and the Vercel project's build environment. Do not replace the local `.env` or `.env.local` with production URLs.

When Vercel builds the frontend, its `VITE_API_BASE_URL` value selects the API for that build. Setting it in Vercel does not change the local Vite configuration, so local development continues to use `http://localhost:3000`.

## Recommended host: Render

The repository includes [`render.yaml`](../render.yaml) for this backend. It defines a Docker web service in Frankfurt, a single instance, a 1 GB persistent disk at `/data`, a `/health/ready` check, and the production settings for the current Vercel frontend. Render derives `PUBLIC_URL` from its assigned service URL. New deploys are gated on the repository's CI checks.

Connect this repository to Render as a Blueprint and apply `render.yaml`. A paid web service is required for a persistent disk. The selected 512 MB compute plan is currently $7/month and the 1 GB disk is $0.25/month, for about $7.25 USD/month before bandwidth overages or taxes. A disk-backed service cannot scale to multiple instances and has a brief interruption during redeploys, which matches this SQLite setup. Check the total in Render before creating the service. [Render disk docs](https://render.com/docs/disks) · [Render pricing](https://render.com/pricing).

## Deploy the Blueprint

The current local branch is `main`, and the Render configuration is not on GitHub until these local changes are committed and pushed. From the repository directory in PowerShell, run:

```powershell
git add README.md docs/operations.md docs/deployment.md render.yaml
git commit -m "Add Render deployment configuration"
git push origin main
```

Then in Render:

1. Open the Dashboard and choose **New** → **Blueprint**.
2. Connect the GitHub account if asked, then select this backend repository and the `main` branch. Keep the Blueprint path at the repository root (`render.yaml`).
3. Review the proposed service before deploying. It should show a web service using the Dockerfile, Frankfurt region, `0.5c-512mb` compute, one instance, and a 1 GB disk mounted at `/data`. Choose the **Hobby** workspace; the workspace subscription is $0, while the service compute and disk are billed separately.
4. Check the final price shown by Render, then select **Deploy Blueprint**. Render builds the image and starts the service. The repository's GitHub Actions checks run on the pushed commit; later pushes to `main` deploy after those checks pass.

When the deployment is live, copy its `https://….onrender.com` URL. Open these endpoints in a browser:

```text
https://<api-hostname>/health/live
https://<api-hostname>/health/ready
```

Both should return a successful response. Readiness should report `status: "ready"`. `payments_configured: false` is expected until merchant payment credentials are provided.

## Provision the first administrator

The production database starts empty; the local database and local admin account are not copied to Render. After the first successful deployment:

1. In the Render service, open **Environment** → **Secret Files** → **Add Secret File**.
2. Name it `admin-input.json` and enter JSON with an admin name, email, and a unique password between 12 and 128 characters. Do not add this file to Git or a Vercel setting.
3. Save the file and wait for the service redeploy to finish.
4. Open the service's **Shell** page and run:

   ```sh
   ADMIN_CREDENTIAL_FILE=/etc/secrets/admin-input.json node --experimental-sqlite dist/scripts/manage.js admin
   ```

5. After the command reports success, delete `admin-input.json` from Render's Secret Files and save. This triggers another deploy and removes the credential file from the service.

The production seed command is disabled. Sign into the storefront's admin area and create the real catalogue there. Payments remain unavailable until the merchant's approved Flutterwave settings are configured.

## Connect Vercel to the API

After Render gives the service a URL, open the Vercel dashboard for the project that serves `https://monve-dusky.vercel.app`:

1. Go to **Settings** → **Environment Variables** → **Add New**.
2. Add `VITE_API_BASE_URL` with the Render URL, for example `https://monve-backend.onrender.com` (use the URL Render actually assigned, without a trailing slash).
3. Apply it to **Production**, save, then redeploy the latest production deployment from **Deployments**.

Vite embeds this public API URL during the build, so saving the variable alone does not update an existing deployment. Leave `VITE_API_EVENTS_URL` blank. Do not put backend secrets in Vercel. [Vercel environment variable docs](https://vercel.com/docs/environment-variables/managing-environment-variables).

Once redeployed, open the storefront, sign into the admin account, add products, and try customer signup/login. The API and Vercel site use different domains for now; the backend is configured for credentialed cross-site cookies, but some browsers restrict third-party cookies. If sign-in does not persist in a browser, using your custom domain for both the site and API (for example `www.example.com` and `api.example.com`) is the follow-up fix. Your local frontend continues to use `http://localhost:3000` and your local backend database.

## Container settings

- Build from the repository `Dockerfile`.
- Expose the port supplied by the host (`PORT`; defaults to `3000`).
- Keep `HOST=0.0.0.0` so the container accepts traffic from the host proxy.
- Use `/health/ready` as the readiness check. The image also defines a Docker health check.
- Keep a persistent volume mounted at `/data` across deploys and restarts.

## Production environment

For Render, `render.yaml` supplies these values, including `PUBLIC_URL` from the generated Render URL. For another host, set these variables in its service settings. Replace `<api-hostname>` with the HTTPS hostname assigned to the service. Do not include a trailing slash in either URL.

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
PUBLIC_URL=https://<api-hostname>
FRONTEND_ORIGINS=https://monve-dusky.vercel.app
DATABASE_PATH=/data/aurie.sqlite
UPLOAD_DIR=/data/uploads
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
PAYMENT_ENVIRONMENT=test
PAYMENT_METHODS=
PAYMENT_REDIRECT_URL=https://monve-dusky.vercel.app/account
DOCS_ENABLED=false
```

If the host assigns `PORT` automatically, use its assigned value instead of `3000`. The API checks the frontend origin exactly, so `FRONTEND_ORIGINS` must be the scheme and hostname only, without a trailing slash or path. `COOKIE_SAME_SITE=none` is needed while the frontend and API use different site domains; it requires secure HTTPS cookies. Browser third-party-cookie restrictions can still affect sign-in across different site domains. When a custom domain is available, using the frontend at `www.<domain>` and the API at `api.<domain>` allows changing `COOKIE_SAME_SITE` to `lax`.

Leave payment methods empty until the merchant's approved Flutterwave credentials, account ID, webhook configuration, and enabled payment methods are ready. Store provider secrets only in the backend host's secret settings. Never put them in Vercel's frontend environment or commit them to this repository.

## Connect the deployed frontend

After the API host assigns its HTTPS URL, set this build-time variable in the Vercel project and redeploy the frontend:

```text
VITE_API_BASE_URL=https://<api-hostname>
```

Leave `VITE_API_EVENTS_URL` empty; this frontend uses polling. Update `FRONTEND_ORIGINS` and `PAYMENT_REDIRECT_URL` if the frontend's domain changes. The current frontend URL is `https://monve-dusky.vercel.app`.

## First start and administration

The API applies versioned database migrations before accepting requests. Keep the persistent volume attached before the first start. Do not seed demo catalogue data into production. Provision the first administrator with the protected credential-file workflow in [operations](operations.md); the local development database and administrator are not copied into the deployed container.
