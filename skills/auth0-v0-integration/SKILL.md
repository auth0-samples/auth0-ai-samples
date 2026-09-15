---
name: auth0-v0-integration
description: >
  Use when installing or managing the Auth0 native integration in Vercel
  Marketplace, connecting Auth0 to a Vercel project, or syncing Auth0
  configuration into a Vercel-hosted Next.js application. Also use when
  troubleshooting auth failures specific to Vercel's v0 preview — iframe
  cookie issues, redirects going to localhost, or "state parameter is invalid"
  errors. Use even if the user doesn't mention Auth0 explicitly.
license: Apache-2.0
metadata:
  author: Auth0 <support@auth0.com>
---

# Auth0 Vercel native integration

The native integration provisions a **new Auth0 tenant environment and
application** for the Vercel project, then preloads the Auth0 configuration in
Vercel. It does not connect an existing Auth0 account. For an existing tenant,
use the standard Auth0 application setup instead of installing this integration.

## Get the full Auth0 skill for anything beyond installation

**Install the full `auth0` skill for the greatest guidance on setting up
Auth0** — this file only covers the Vercel Marketplace integration:
provisioning, credential handling, and v0 preview troubleshooting. For the
Auth0 SDK integration itself (Next.js routes, middleware, session handling),
tenant configuration beyond callback/logout URLs, Universal Login branding,
or any other Auth0 feature, install it and let its router load what the task
needs:

```bash
npx skills add auth0/agent-skills
```

Do this early, not as a last resort after something breaks — the sections
below that touch tenant configuration or branding intentionally state the CLI
command and move on; the full skill's `tooling-cli` reference has the
complete command set, flag reference, and agent-mode output conventions.

## Confirm before provisioning

Before installing, state what will happen and get confirmation:

- A new Auth0 account/tenant environment and application will be created.
- The integration will connect to the selected Vercel project and environments.
- Auth0 credentials will be populated in Vercel environment variables. Do not
  print, commit, or copy their values into source control.
- Removing the integration removes the connected Auth0 account and downgrades
  the installation to Vercel's Free plan.
- An installation plan is selected during setup. Paid plans are billed through
  Vercel via the integration's Settings page; state the selected plan and its
  billing impact.

Confirm the Vercel team, project, environments, application name, selected
installation plan, and optional environment-variable prefix. If the developer
wants an existing Auth0 tenant, stop this workflow and use the normal
tenant/application configuration path.

## Prerequisites

- A Vercel account and active Vercel project.
- A Next.js application using the current `@auth0/nextjs-auth0` SDK.
- Permission to install integrations for the intended Vercel team and create
  the connected Auth0 account.
- Iframe embedding enabled after installation, so Universal Login or Classic
  Login can load in the iframe required by Vercel. This relaxes the default
  framing protection for Universal Login, so enable it only for this
  integration and confirm the developer accepts the tradeoff.

The router co-loads the Next.js reference for the SDK implementation. Do not
replace its Auth0 routes, middleware/proxy, session handling, or environment
variable conventions with a marketplace-specific variant.

## Install the native integration

### Vercel Marketplace

1. In Vercel, open **Integrations** → **Browse Marketplace** and find
   **Auth0** under Native Integrations.
2. Select **Install**, choose the installation plan, and continue.
3. Name the Auth0 application and create it. Vercel creates the dedicated
   Auth0 tenant environment and application; wait for completion.
4. Select **Connect Project**, choose the Vercel project and target
   environments, enter a variable prefix only if the project requires one, and
   connect.
5. Open the integration's **Getting Started** page and follow its generated
   quickstart.

The Vercel CLI can start the same provisioning flow from the project directory.
Pass `--no-env-pull` so the CLI does not run `vercel env pull` automatically
after provisioning — pulling secrets is a separate, deliberate step below, run
only after confirming `.env.local` is ignored:

```bash
vc i auth0 --no-env-pull
```

Do not treat `vc i auth0` as read-only. It provisions a resource, so run it
only after the developer confirms the target team and project.

## Configure the tenant with the Auth0 CLI

**Before touching tenant config, verify:** decode the running app's login
`redirect_uri` to confirm which tenant/client it uses → confirm that
`client_id` matches the credentials in hand → mint a Management API token
(below) to prove the M2M credentials actually work → only then make changes.
Skipping this and configuring the wrong tenant, or configuring correctly but
with M2M credentials that don't actually work (placeholder values, wrong
environment), is the most common failure mode here.
Reconnecting the integration is destructive to prior tenant config — it
provisions a **new** tenant and application client, so treat any reconnect as
"redo tenant setup," not "resume it."

Once the integration completes, an M2M grant lets you configure the
provisioned tenant directly instead of routing every change through the Auth0
dashboard. **Prefer the CLI for tenant configuration** — callback/logout URLs,
iframe embedding, application settings — and fall back to the dashboard only
where noted below.

```bash
auth0 login --domain <tenant>.auth0.com --client-id "$AUTH0_MANAGEMENT_API_CLIENT_ID" --client-secret "$AUTH0_MANAGEMENT_API_CLIENT_SECRET"
```

Use the M2M client ID/secret the integration provisioned (do not print or log
the secret). This is the same machine-login pattern the CLI uses for any
non-interactive environment — see the full `auth0` skill's `tooling-cli`
reference for every command and flag.

If no M2M grant is available yet, fall back to `auth0 login` (interactive
device-code) or the dashboard steps in the sections below.

### The M2M credentials are named after the Management API

The integration provisions a Management API M2M client and exposes it under
these exact Vercel env var names:

- `AUTH0_MANAGEMENT_API_CLIENT_ID`
- `AUTH0_MANAGEMENT_API_CLIENT_SECRET`

Use them verbatim. Do not invent or assume `AUTH0_CLIENT_M2M_ID` /
`AUTH0_CLIENT_M2M_SECRET` — those names don't exist in what the integration
provisions, and guessing at them wastes a round-trip discovering `env pull`
never populated them. Confirm the token actually mints before doing anything
else; the audience must be the tenant's own Management API:

```bash
curl -s --request POST \
  --url "https://$AUTH0_DOMAIN/oauth/token" \
  --data grant_type=client_credentials \
  --data "client_id=$AUTH0_MANAGEMENT_API_CLIENT_ID" \
  --data "client_secret=$AUTH0_MANAGEMENT_API_CLIENT_SECRET" \
  --data "audience=https://$AUTH0_DOMAIN/api/v2/"
```

A successful response returns an `access_token`. Anything else — including
`access_denied` — means the credentials, the audience, or the environment
they came from is wrong; see the next two sections before assuming it's a bad
secret.

### Only the development environment has working M2M credentials

Each Vercel environment (Production/Preview/Development) gets its own Auth0
**tenant** and application client. Development additionally gets a real,
authorized M2M client for the Management API. **Production and Staging only
get placeholder `AUTH0_MANAGEMENT_API_CLIENT_ID`/`_SECRET` values** — dummy
strings, not a provisioned-but-unauthorized client. Always verify with the
token-mint `curl` above rather than assuming either way.

For CLI or Management API work against the running v0 preview: pull the
Development environment's values (`vercel env pull .env.local
--environment=development`), verify the token mints, then configure the
tenant/application client that Development points at — that's what the v0
preview actually runs against.

### If you need CLI/Management API access for Production or Staging

If the token-mint check fails, don't guess at a fix — walk through creating a
real M2M client for that environment and wiring it in:

1. In the Auth0 dashboard, switch to the Production/Staging tenant (top-left
   tenant switcher).
2. Go to **Applications → Applications → Create Application**, choose
   **Machine to Machine Applications**, name it (e.g. `v0-management-prod`),
   and authorize it against the **Auth0 Management API** with the scopes you
   need — at minimum `read:clients`, `update:clients`, `read:branding`,
   `update:branding`.
3. Open the new application's **Settings** tab and copy its **Client ID** and
   **Client Secret**.
4. Set those two values as `AUTH0_MANAGEMENT_API_CLIENT_ID` and
   `AUTH0_MANAGEMENT_API_CLIENT_SECRET` on the Vercel project, scoped to that
   specific environment, replacing the placeholder values. Do this either:
   - directly in the Vercel project's environment variable settings
     yourself, or
   - by pasting the Client ID/Secret into the v0 chat and having the agent
     save them as env vars on that environment through its own tooling —
     don't have the agent print, log, or echo the secret back once saved.
5. Re-run the token-mint `curl` against that environment to confirm before
   relying on it.

## Use the generated configuration safely

The integration preloads Auth0 credentials in the Vercel project. Its
quickstart exposes values such as `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`,
`AUTH0_DOMAIN`, and `AUTH0_SECRET`; retrieve them through Vercel rather than
copying secrets from a dashboard or committing a `.env.local` file.

If you set a variable prefix when connecting the project, Vercel names the
managed values `[prefix]_AUTH0_DOMAIN`, `[prefix]_AUTH0_CLIENT_ID`, and so on,
but the `@auth0/nextjs-auth0` SDK only reads the unprefixed default names.
Prefer connecting with no prefix. If a prefix is required, map the prefixed
values back to the standard names in your app before constructing `Auth0Client`
(or pass them explicitly to the constructor).

First confirm `.env.local` is both untracked and git-ignored so the pull cannot
write real client secrets into a tracked file. Stop if either check fails. Then
link the checkout and pull the values:

```bash
# BEFORE pulling any secrets: fail if .env.local is tracked or not ignored.
if git ls-files --error-unmatch -- .env.local >/dev/null 2>&1 \
   || ! git check-ignore --no-index --quiet -- .env.local; then
  echo ".env.local must be untracked and git-ignored before pulling secrets"
  exit 1
fi

# Link the local checkout to the intended Vercel project, then pull local-only values.
vercel link
# For the v0 preview, pull DEVELOPMENT (see "Only the development environment
# has working M2M credentials" above). For a deployed Production app, pull
# --environment=production.
vercel env pull .env.local --environment=development
```

> **The v0 preview runtime does NOT auto-inject the project's Vercel env
> vars** — the dev server only sees `.env.local`. If `process.env.AUTH0_DOMAIN`
> is undefined at request time, the SDK falls back to a header-based domain
> resolver that throws `DomainResolutionError` on every route. `vercel env ls`
> showing the vars proves nothing about the runtime; only a request that
> actually reads `process.env` proves it.

> **Confirm which Vercel project the chat actually runs on.** Connecting the
> integration to a differently named project than the one the chat
> builds/deploys against is a common cause of "the vars exist but the app
> can't see them."

For local development the current Next.js SDK also needs `APP_BASE_URL`; set it
to your local URL (e.g. `http://localhost:3000`) in `.env.local`, and keep the
canonical production URL configured for the deployed environment. The SDK can
infer `APP_BASE_URL` from the request on Vercel previews, but do not derive it
from an untrusted request header in code.

The native-integration quickstart's own walkthrough only wires up the
Production environment. Preview and Development are provisioned automatically
too, but may still need non-Auth0 variables added or scoped manually before
testing.

## Deploy and verify

1. Follow the co-loaded Next.js reference to install `@auth0/nextjs-auth0`,
   configure `Auth0Client`, add the proxy/middleware, and add login/logout UI.
2. Verify the generated Auth0 application has the production callback and
   logout URLs. The integration populates localhost and callback URLs initially;
   update them with the CLI when the canonical domain or callback path changes:

   ```bash
   auth0 apps update <client-id> \
     --callbacks "https://<canonical-domain>/auth/callback" \
     --logout-urls "https://<canonical-domain>"
   ```

3. Deploy to the selected Vercel Production environment and complete login,
   callback, session, protected-route, and logout checks on the deployed URL.
4. Match Universal Login branding to the app being secured — don't leave the
   default Auth0 branding on a login page that's supposed to look like part
   of the app. At minimum, set the logo, primary/page background color, and
   button/input border radius to match the app; pull the values from the
   app's own theme/CSS rather than guessing. Use the full `auth0` skill's
   branding guidance for the exact CLI/Management API calls (`auth0 branding
   ...`, or `PATCH /api/v2/branding` and `PUT
   /api/v2/branding/themes/default`); this file only calls out that the step
   exists. Re-check branding after any tenant reconnect — see
   "Callback mismatch / login fails after reconnecting the integration" in
   Troubleshoot.
5. If login fails in Vercel's embedded experience, enable iframe embedding —
   see "Login page won't frame" under "Auth0 in the v0 preview" for the
   tenant setting, origin scoping, and dashboard path (not yet a CLI flag).
   Check this before changing callback URLs or SDK code.

## Manage the integration

Use the CLI for application-level changes (callback/logout URLs, grant types,
metadata) once the M2M grant is available — see `auth0 apps update --help`.

Use the Vercel project **Integrations** tab → **Auth0** → **Manage** for
Vercel-side operations the CLI has no access to: rotating the credentials
Vercel injects, editing the localhost/callback parameters Vercel tracks
separately, setting allowed environments, changing the installation plan, or
removing the integration. Use the Auth0 Dashboard for anything CLI-unsupported,
such as Universal Login customization.

Before rotating secrets or changing callback URLs, identify every deployment
that consumes the affected variables and plan a redeploy. After rotation,
confirm the new variables are present in the intended Vercel environment and
that login works before removing the old secret from dependent systems.

## Troubleshoot

| Symptom | Check | Resolution |
|---|---|---|
| Marketplace flow creates a different tenant than expected | Native-integration behavior | Expected: it creates a dedicated new Auth0 tenant environment. Use standard Auth0 setup for an existing tenant. |
| Local app has missing Auth0 variables | Vercel project link and environment selection | Run `vercel link` for the intended project, then `vercel env pull .env.local`; keep the file out of Git. |
| Production works but Preview fails | Variable scope | Add or scope the required non-Auth0 variables deliberately; the generated quickstart's walkthrough only covers wiring up Production, even though Preview/Development are each provisioned automatically. |
| Callback mismatch after deploy | Canonical URL and Auth0 application URLs | See "Deploy and verify" step 2 — update callback/logout URLs with `auth0 apps update` to match `APP_BASE_URL` exactly. |
| Login does not render in Vercel's embedded experience | Iframe embedding | See "Deploy and verify" step 5 — enable iframe embedding, scoped to the intended origins, before changing application code. |
| Integration removal has unexpected account impact | Removal warning | Stop and confirm the removal: deleting the integration removes the connected Auth0 account and downgrades the Vercel installation. |
| No M2M grant available yet | Integration provisioning stage | Fall back to `auth0 login` (interactive) or the dashboard steps in this file until the grant is issued. |
| `DomainResolutionError` on every route | `process.env.AUTH0_DOMAIN` missing at request time | The preview runtime doesn't auto-inject project env vars; pull into `.env.local` (Development environment) and confirm the value is present. Harden `middleware.ts` to skip Auth0 handling when config is absent so the site degrades instead of 500ing. |
| Token request returns `access_denied` (or fails to mint) for the Management API | Using Production/Staging's placeholder M2M values, which aren't a real client | Use the Development environment's M2M credentials for preview work, or create a real M2M client for that environment and wire in its Client ID/Secret (see "If you need CLI/Management API access for Production or Staging"). Don't assume it's a wrong secret — verify with a token-mint request first. |
| Login/signup click does nothing; server log shows only `GET /` | Auth button uses `window.open()`, blocked by the sandboxed iframe | Use a real `<a target="_blank">` anchor (via base-ui's `render` prop, not `asChild`). |
| Callback mismatch / login fails after reconnecting the integration | Reconnect provisioned a NEW tenant + application client | Re-register callback/logout/web-origin URLs and re-apply branding on the CURRENT client. Decode the live login `redirect_uri` and `client_id` to confirm which client is actually in use. |

## Auth0 in the v0 preview

The v0 preview runs your app inside a cross-site iframe on an HTTPS origin that
is neither localhost nor a `VERCEL_URL`. Three common auth failures all trace
back to that fact. Keep these in mind and the flow works the first time.

### 1. Redirect goes to localhost ("localhost refused to connect")

The SDK builds its login/callback redirect from a base-URL setting that
defaults to `localhost`. In the preview, `VERCEL_URL` and
`VERCEL_PROJECT_PRODUCTION_URL` are unset, so anything relying on them falls
back to localhost. Resolve the app's base URL from the runtime origin and
include the v0 preview origin (`V0_RUNTIME_URL`) in the fallback chain, ahead of
the localhost default. Verify by inspecting the actual `redirect_uri` on the
login redirect, not just that the page compiles.

### 2. State cookie dropped ("The state parameter is invalid")

The SDK stores a short-lived transaction/state cookie during the redirect and
reads it back on the callback. Default `SameSite=Lax` cookies are not sent on
the cross-site callback inside the iframe, so validation fails. When the framed
preview must remain authenticated, set the session cookie to
`SameSite=None; Secure`. Keep the transaction cookie at `SameSite=Lax` for
the top-level callback. Use `SameSite=None; Secure` for the transaction
cookie only when the callback uses an iframe or `form_post`. Document
independent CSRF protection for the cross-site session cookie. Keep plain
`localhost` HTTP on the safe defaults, since `Secure` cookies can't be set over
HTTP.

### 3. Login page won't frame ("This content is blocked")

Hosted login pages may send frame-busting headers when iframe embedding is not
enabled. First restrict the allowed iframe origins to the intended Vercel
URLs, then enable the setting — it's a tenant flag not yet exposed as a CLI
flag: **Auth0 Dashboard → Settings → Advanced → Allow Cross-Origin
Authentication**. Enabling it relaxes clickjacking protection, so scope the
origins first. If embedding isn't viable, open authentication in a top-level
context instead.

Make the login (and logout) navigation break out of the iframe using a real
anchor, not a programmatic `window.open(...)`. The v0 preview iframe is
sandboxed, so a script-initiated `window.open` is silently swallowed by the
popup blocker — the click appears to do nothing, and the server log shows only
`GET /` with no `/auth/*` request ever arriving. A real `<a target="_blank">`
click is a user-initiated navigation, so the sandbox and popup blocker let it
through:

```jsx
<a href="/auth/login" target="_blank" rel="noopener noreferrer">Log in</a>
<a href="/auth/logout" target="_blank" rel="noopener noreferrer">Log out</a>
```

v0's default `Button` is `base-ui`, which composes via a `render` prop, not
Radix's `asChild` — passing `asChild` throws `"React does not recognize the
asChild prop"`:

```jsx
<Button render={<a href="/auth/login" target="_blank" rel="noopener noreferrer" />}>Log in</Button>
```

After login completes in the top-level context, the framed preview needs a
refresh to pick up the new session cookie.

### Configuration lives outside the code

Callback/logout URLs and application settings are configured on the tenant,
not in the app. Once an M2M grant is available, use the CLI:

```bash
auth0 apps update <client-id> \
  --callbacks "https://<project>.v0.build/auth/callback,http://localhost:3000/auth/callback" \
  --logout-urls "https://<project>.v0.build"
```

The Vercel Auth0 integration auto-syncs real Vercel deployment domains and
owns the `AUTH0_*` env vars, so hand-edited values can be overwritten — don't
assume env vars alone prove which tenant an environment uses; confirm with
`auth0 apps show <client-id>` or the dashboard.

Non-Vercel origins are never auto-synced, so register them explicitly. The one
that gets the preview working is the app's **stable v0 preview URL**
(`V0_RUNTIME_URL`, e.g. `https://<project>.v0.build`) — it stays constant
across rebuilds, so registering it once is what makes login succeed in the
preview. (Per-deployment Vercel URLs change every build and aren't worth
registering by hand.) Also register `localhost` for local dev.

**No M2M grant yet, or the CLI isn't available:** register the URLs by hand
instead:

1. In the Auth0 dashboard, pick the tenant the app's env vars point at
   (top-left tenant switcher — there may be separate Development/Staging/
   Production tenants).
2. Go to **Applications → Applications** and open the app's client (the
   integration names it "Created By Vercel"; match it by Client ID if unsure).
3. On the **Settings** tab, add to the comma-separated lists (use the stable
   v0 preview origin):
   - **Allowed Callback URLs**: the full callback path, e.g.
     `https://<project>.v0.build/auth/callback` (add `http://localhost:3000/auth/callback`
     too for local dev).
   - **Allowed Logout URLs**: the origin the user returns to, e.g.
     `https://<project>.v0.build`.
4. **Save Changes** at the bottom. Give the exact origin — Auth0 matches these
   URLs exactly, so a missing entry is what causes callback/logout rejections.
