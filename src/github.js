'use strict';
// Minimal GitHub App client (no deps). Private key is read from a path and never printed.
const crypto = require('node:crypto');
const fs = require('node:fs');

const b64u = b => Buffer.from(b).toString('base64url');
function appJwt(appId, pem, now = Math.floor(Date.now() / 1000)) {
  const h = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const p = b64u(JSON.stringify({ iat: now - 60, exp: now + 540, iss: String(appId) }));
  const s = crypto.sign('RSA-SHA256', Buffer.from(`${h}.${p}`), pem).toString('base64url');
  return `${h}.${p}.${s}`;
}

// Private key sources, first match wins: PRIVATE_KEY_BASE64, PRIVATE_KEY (PEM, \\n allowed), PRIVATE_KEY_PATH.
function loadPrivateKey({ env = process.env, keyPath = env.PRIVATE_KEY_PATH } = {}) {
  if (env.PRIVATE_KEY_BASE64) return Buffer.from(env.PRIVATE_KEY_BASE64, 'base64').toString('utf8');
  if (env.PRIVATE_KEY) return env.PRIVATE_KEY.replace(/\\n/g, '\n');
  if (keyPath) return fs.readFileSync(keyPath, 'utf8');
  throw new Error('no GitHub App private key configured');
}

function client({ appId = process.env.APP_ID, keyPath = process.env.PRIVATE_KEY_PATH, fetchImpl = globalThis.fetch, api = 'https://api.github.com' } = {}) {
  async function req(token, method, url, body) {
    const r = await fetchImpl(api + url, { method, headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'credit-wallet' }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GitHub ${method} ${url} -> ${r.status}`);
    return r.status === 204 ? {} : r.json();
  }
  async function installationToken(installationId) {
    const jwt = appJwt(appId, loadPrivateKey({ keyPath }));
    const r = await req(jwt, 'POST', `/app/installations/${installationId}/access_tokens`);
    return r.token;
  }
  return { req, installationToken };
}

module.exports = { appJwt, client, loadPrivateKey };
