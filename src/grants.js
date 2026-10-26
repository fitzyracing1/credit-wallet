'use strict';
// Read-only view of pending grants. Grant data is returned only after GitHub confirms the caller's
// token belongs to the installation's account (user) or an active admin of it (org). Fails closed.
const queue = require('./queue');

const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

async function grantsFor(gh, authHeader, ownerParam, dataDir) {
  const m = /^Bearer\s+(\S+)$/i.exec(authHeader || '');
  if (!m) return { status: 401, body: { error: 'Authorization: Bearer <GitHub user token> required' } };
  const user = await gh.req(m[1], 'GET', '/user').catch(() => null);
  if (!user || !user.login) return { status: 401, body: { error: 'invalid token' } };
  const owner = ownerParam || user.login;
  if (!LOGIN.test(owner)) return { status: 400, body: { error: 'bad owner' } };

  let ok = owner.toLowerCase() === user.login.toLowerCase();
  if (!ok) {
    const mem = await gh.req(m[1], 'GET', `/user/memberships/orgs/${owner}`).catch(() => null);
    ok = !!mem && mem.state === 'active' && mem.role === 'admin';
  }
  if (!ok) return { status: 403, body: { error: 'not the owner or an admin of this account' } };

  const inst = (await gh.appReq('GET', `/users/${owner}/installation`).catch(() => null))
    || (await gh.appReq('GET', `/orgs/${owner}/installation`).catch(() => null));
  if (!inst) return { status: 403, body: { error: 'credit-wallet is not installed on this account' } };

  const pending = queue.load(dataDir).filter(p => p.status === 'proposed' && String(p.owner).toLowerCase() === owner.toLowerCase());
  return { status: 200, body: { owner, installation: inst.id, pending } };
}

module.exports = { grantsFor };
