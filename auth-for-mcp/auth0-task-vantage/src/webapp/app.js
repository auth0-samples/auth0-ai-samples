import { Hono } from 'hono';
import { auth } from '@auth0/auth0-hono';
import { serveStatic } from '@hono/node-server/serve-static';
import * as fs from 'fs';
import * as path from 'path';
import * as env from './env.js';

const app = new Hono();

// auth for /app/*
app.use('/app/*', auth({
  enabled: env.AUTH_ENABLED,
  domain: env.AUTH0_DOMAIN,
  clientID: env.WEBAPP_AUTH0_CLIENT_ID,
  clientSecret: env.WEBAPP_AUTH0_CLIENT_SECRET,
  baseURL: env.WEBAPP_BASE_URL,
  idpLogout: false,
  session: { secret: env.WEBAPP_SESSION_SECRET, cookie: { name: 'webapp_auth0_session' } },
  routes: { callback: '/app/callback' },
  authorizationParams: {
    audience: env.API_AUTH0_AUDIENCE,
    scope: 'openid profile email projects:read projects:write tasks:read tasks:write'
  }
}));

// minimal SSR for pages
const htmlCache = new Map();
function readHtmlCached(filename) {
  if (htmlCache.has(filename)) return htmlCache.get(filename);
  const full = path.join(process.cwd(), 'src/webapp/public', filename);
  const html = fs.readFileSync(full, 'utf-8');
  htmlCache.set(filename, html);
  return html;
}

app.get('/', (c) => c.html(readHtmlCached('home.html')));
app.get('/home.html', (c) => c.html(readHtmlCached('home.html')));
app.get('/app', (c) => c.html(readHtmlCached('dashboard.html')));
app.get('/dashboard.html', (c) => c.html(readHtmlCached('dashboard.html')));

// helpers
const getAuthClient = (c) => c.var?.auth0Client ?? null;

async function getSession(c) {
  const client = getAuthClient(c);
  return client ? client.getSession(c) : null;
}

async function getAccessToken(c) {
  const s = await getSession(c);
  const ts = s?.tokenSets?.find((t) => t.audience === env.API_AUTH0_AUDIENCE);
  return ts?.accessToken ?? null;
}

function hasJsonBody(c) {
  const ct = c.req.header('content-type') || '';
  return ct.includes('application/json');
}

async function readJsonSafe(c) {
  if (!hasJsonBody(c)) return undefined;
  try { return await c.req.json(); } catch { return undefined; }
}

function withAuth(handler) {
  return async (c) => {
    const token = await getAccessToken(c);
    if (!token) return c.json({ error: 'No access token available' }, 401);
    try {
      return await handler(c, token);
    } catch (e) {
      console.error('Proxy error:', e);
      return c.json({ error: 'Upstream request failed' }, 500);
    }
  };
}

function upstreamUrl(pathname, qs) {
  if (!qs || Object.keys(qs).length === 0) return `${env.API_BASE_URL}${pathname}`;
  const usp = new URLSearchParams(qs);
  return `${env.API_BASE_URL}${pathname}?${usp.toString()}`;
}

/**
 * proxy(method, tpl, opts)
 * opts.expectJson: false to allow 204 or text
 * opts.forwardBody: false to skip reading body
 */
function proxy(method, tpl, opts = {}) {
  const { expectJson = true, forwardBody = method !== 'GET' && method !== 'DELETE' } = opts;

  return withAuth(async (c, token) => {
    const id = c.req.param('id') ?? '';
    const pathname = tpl.replace(':id', id);
    const url = method === 'GET'
      ? upstreamUrl(pathname, c.req.query())
      : `${env.API_BASE_URL}${pathname}`;

    const init = {
      method,
      headers: { Authorization: `Bearer ${token}` }
    };

    if (forwardBody) {
      const body = await readJsonSafe(c);
      if (body !== undefined) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
    }

    const r = await fetch(url, init);

    const ct = r.headers.get('content-type') || '';
    if (!expectJson || r.status === 204 || !ct.includes('application/json')) {
      const text = await r.text().catch(() => '');
      return text ? c.text(text, r.status) : c.body(null, r.status);
    }

    let data;
    try { data = await r.json(); } catch { data = { ok: r.ok }; }
    return c.json(data, r.status);
  });
}

async function getUser(c) {
  const s = await getSession(c);
  const user = s?.user ?? {};
  const isInternal = !!user.email && (user.email.includes('@pledgerocket.com') || user.email.includes('@okta.com'));
  if (user.name && user.name.includes('@okta.com')) user.name = user.name.replace('@okta.com', '@pledgerocket.com');
  const isB2B = !!user.email && !isInternal;
  return { ...user, userType: isB2B ? 'B2B Customer' : isInternal ? 'Analyst @ PledgeRocket' : 'Guest', isB2BCustomer: isB2B };
}

// api
app.get('/app/api/me', async (c) => {
  const profile = await getUser(c);
  c.header('Cache-Control', 'no-store');
  return c.json({ user: profile });
});

app.get('/app/api/projects', proxy('GET', '/projects'));
app.post('/app/api/projects', proxy('POST', '/projects'));
app.delete('/app/api/projects/:id', proxy('DELETE', '/projects/:id'));

app.get('/app/api/tasks', proxy('GET', '/tasks'));
app.post('/app/api/tasks', proxy('POST', '/tasks'));
app.patch('/app/api/tasks/:id/status', proxy('PATCH', '/tasks/:id/status'));
app.delete('/app/api/tasks/:id', proxy('DELETE', '/tasks/:id'));

// clear-all: no body, may return 204 or text
app.post('/app/api/admin/clear', proxy('POST', '/admin/clear', { expectJson: false, forwardBody: false }));

// static assets last
app.use('/*', serveStatic({ root: './src/webapp/public' }));

// logout
app.get('/app/logout', async (c) => {
  const client = getAuthClient(c);
  if (client) {
    await client.logout({}, c);
    const u = `https://${env.AUTH0_DOMAIN}/v2/logout?federated&returnTo=${encodeURIComponent(env.WEBAPP_BASE_URL)}&client_id=${env.WEBAPP_AUTH0_CLIENT_ID}`;
    return c.redirect(u);
  }
  return c.redirect('/');
});

export default function createWebApp() {
  return app;
}
