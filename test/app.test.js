'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { handle, chooseWalletRepo } = require('../src/handler');
const { verifySignature } = require('../src/verify');
const { appJwt } = require('../src/github');
const queue = require('../src/queue');
const { emptyWallet, clampWeight } = require('../src/wallet');
const { createServer } = require('../src/server');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cw-'));

function fakeGh(existing = {}) {
  const calls = [];
  return { calls, installationToken: async () => 'tok', req: async (t, m, u, b) => {
    calls.push([m, u, b]);
    if (m === 'GET' && u === '/repos/alice/credit') return { default_branch: 'main' };
    if (m === 'GET' && u.endsWith('/contents/CREDIT.json')) return existing.wallet ? {} : null;
    if (m === 'GET' && u.endsWith('/git/ref/heads/main')) return { object: { sha: 'abc' } };
    if (m === 'GET') return null;
    if (u.endsWith('/pulls')) return { html_url: 'https://github.com/alice/credit/pull/1' };
    return {};
  } };
}
const install = (extra = {}) => ({ action: 'created', installation: { id: 1, account: { login: 'alice' } }, sender: { login: 'alice' }, repositories: [{ name: 'credit', full_name: 'alice/credit' }], ...extra });
const merged = (login = 'bob', type = 'User') => ({ action: 'closed', installation: { id: 1 }, repository: { full_name: 'alice/proj', owner: { login: 'alice' } },
  pull_request: { merged: true, number: 7, title: 'Fix bug', user: { login, type }, merged_at: '2026-10-25T00:00:00Z' } });

test('ignores events without an installation (opt-in only)', async () => {
  const gh = fakeGh();
  const r = await handle('pull_request', { action: 'closed', pull_request: { merged: true } }, { gh, dataDir: tmp() });
  assert.match(r.ignored, /not opted in/); assert.strictEqual(gh.calls.length, 0);
});

test('install opens exactly one CREDIT.json PR in the installer repo', async () => {
  const gh = fakeGh();
  const r = await handle('installation', install(), { gh, dataDir: tmp() });
  assert.strictEqual(r.pr, 'https://github.com/alice/credit/pull/1');
  const writes = gh.calls.filter(c => c[0] !== 'GET');
  assert.deepStrictEqual(writes.map(c => c[1]), ['/repos/alice/credit/git/refs', '/repos/alice/credit/contents/CREDIT.json', '/repos/alice/credit/pulls']);
  const body = JSON.parse(Buffer.from(writes[1][2].content, 'base64').toString());
  assert.strictEqual(body.credit, 'CREDIT-1/balance'); assert.strictEqual(body.balance, 0);
  assert.ok(!gh.calls.some(c => /comments|issues/.test(c[1])));
});

test('install skips when CREDIT.json exists, or sender is not the account', async () => {
  let gh = fakeGh({ wallet: true });
  assert.match((await handle('installation', install(), { gh })).skipped, /exists/);
  gh = fakeGh();
  assert.match((await handle('installation', install({ sender: { login: 'mallory' } }), { gh })).ignored, /not the account owner/);
  assert.strictEqual(gh.calls.length, 0);
});

test('chooseWalletRepo never guesses among many', () => {
  const rs = [{ name: 'a' }, { name: 'b' }];
  assert.strictEqual(chooseWalletRepo(rs), null);
  assert.strictEqual(chooseWalletRepo(rs, 'b').name, 'b');
  assert.strictEqual(chooseWalletRepo([{ name: 'a' }]).name, 'a');
});

test('merged PR queues an UNSIGNED proposal and makes zero API calls', async () => {
  const gh = fakeGh(); const d = tmp();
  const r = await handle('pull_request', merged(), { gh, dataDir: d });
  assert.strictEqual(r.queued, 'alice/proj#7'); assert.strictEqual(gh.calls.length, 0);
  const [p] = queue.load(d);
  assert.strictEqual(p.signed, false); assert.strictEqual(p.status, 'proposed'); assert.ok(!('sig' in p));
  assert.match((await handle('pull_request', merged(), { gh, dataDir: d })).ignored, /already/);
});

test('bots and the owner are not queued', async () => {
  const d = tmp();
  assert.match((await handle('pull_request', merged('dependabot[bot]', 'Bot'), { gh: fakeGh(), dataDir: d })).ignored, /bot/);
  assert.match((await handle('pull_request', merged('alice'), { gh: fakeGh(), dataDir: d })).ignored, /owner/);
  assert.strictEqual(queue.load(d).length, 0);
});

test('approve only changes status and returns a give command; weight capped at 100', () => {
  const d = tmp();
  const p = queue.propose({ owner: 'a', repo: 'a/b', pr: 1, author: 'bob', weight: 500 }, d);
  assert.strictEqual(p.weight, 100); assert.strictEqual(clampWeight(0), 1);
  const a = queue.setStatus('a/b#1', 'approved', d);
  assert.strictEqual(a.signed, false);
  assert.strictEqual(queue.giveCommand(a), 'node cli/credit.js give bob 100 --for "PR a/b#1"');
  assert.throws(() => queue.setStatus('a/b#1', 'approved', d), /already/);
});

test('wallet matches credit-1 balance shape', () => {
  const w = emptyWallet('alice/credit');
  assert.deepStrictEqual(w.recipient, { type: 'repo', id: 'alice/credit' });
  assert.throws(() => emptyWallet('nope'));
});

test('signature verification', () => {
  const body = Buffer.from('{}');
  const sig = 'sha256=' + crypto.createHmac('sha256', 's').update(body).digest('hex');
  assert.ok(verifySignature('s', body, sig));
  assert.ok(!verifySignature('x', body, sig)); assert.ok(!verifySignature('s', body, undefined));
});

test('app JWT is RS256 and verifiable', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwt = appJwt(42, privateKey.export({ type: 'pkcs1', format: 'pem' }), 1000);
  const [h, p, s] = jwt.split('.');
  assert.strictEqual(JSON.parse(Buffer.from(p, 'base64url')).iss, '42');
  assert.ok(crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), publicKey, Buffer.from(s, 'base64url')));
});

test('server rejects unsigned webhooks and queues signed ones', async () => {
  const d = tmp(); const srv = createServer({ secret: 's', gh: fakeGh(), dataDir: d });
  await new Promise(r => srv.listen(0, r));
  const url = `http://127.0.0.1:${srv.address().port}/webhook`;
  const body = JSON.stringify(merged());
  let r = await fetch(url, { method: 'POST', body, headers: { 'x-github-event': 'pull_request' } });
  assert.strictEqual(r.status, 401);
  const sig = 'sha256=' + crypto.createHmac('sha256', 's').update(body).digest('hex');
  r = await fetch(url, { method: 'POST', body, headers: { 'x-github-event': 'pull_request', 'x-hub-signature-256': sig } });
  assert.deepStrictEqual(await r.json(), { queued: 'alice/proj#7' });
  srv.close();
});

test('GET / serves a self-contained homepage', async () => {
  const srv = createServer({ secret: 's', gh: fakeGh(), dataDir: tmp() });
  await new Promise(r => srv.listen(0, r));
  const r = await fetch(`http://127.0.0.1:${srv.address().port}/`);
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  const html = await r.text();
  for (const s of ['credit-wallet', 'opt-in', 'unsigned proposal', 'did not install', 'github.com/fitzyracing1/credit-wallet', '/healthz']) assert.ok(html.includes(s), s);
  assert.ok(!/<script|<link|src=/i.test(html), 'no external deps');
  srv.close();
});

test('private key loads from PRIVATE_KEY_BASE64 or PRIVATE_KEY', () => {
  const { loadPrivateKey } = require('../src/github');
  const pem = '-----BEGIN KEY-----\nabc\n-----END KEY-----\n';
  assert.strictEqual(loadPrivateKey({ env: { PRIVATE_KEY_BASE64: Buffer.from(pem).toString('base64') } }), pem);
  assert.strictEqual(loadPrivateKey({ env: { PRIVATE_KEY: pem.replace(/\n/g, '\\n') } }), pem);
  assert.throws(() => loadPrivateKey({ env: {} }), /no GitHub App private key/);
});

function authGh({ users = { tA: 'alice', tM: 'mallory' }, installed = ['alice', 'acme'], admins = {} } = {}) {
  return { installationToken: async () => 'x',
    req: async (t, m, u) => {
      if (u === '/user') return users[t] ? { login: users[t] } : null;
      const om = /^\/user\/memberships\/orgs\/(.+)$/.exec(u);
      if (om) return (admins[t] || []).includes(om[1]) ? { state: 'active', role: 'admin' } : null;
      return null;
    },
    appReq: async (m, u) => { const o = u.split('/')[2]; return installed.includes(o) ? { id: 99 } : null; } };
}

test('/grants: denied without or with bad auth, and for other owners', async () => {
  const { grantsFor } = require('../src/grants');
  const d = tmp(); queue.propose({ owner: 'alice', repo: 'alice/p', pr: 1, author: 'bob' }, d);
  const gh = authGh();
  assert.strictEqual((await grantsFor(gh, undefined, null, d)).status, 401);
  assert.strictEqual((await grantsFor(gh, 'Bearer nope', null, d)).status, 401);
  const r = await grantsFor(gh, 'Bearer tM', 'alice', d);
  assert.strictEqual(r.status, 403); assert.ok(!JSON.stringify(r.body).includes('bob'));
  assert.strictEqual((await grantsFor(gh, 'Bearer tM', null, d)).status, 403); // mallory has no install
});

test('/grants: returns only the caller own pending grants; org admin allowed', async () => {
  const { grantsFor } = require('../src/grants');
  const d = tmp();
  queue.propose({ owner: 'alice', repo: 'alice/p', pr: 1, author: 'bob' }, d);
  queue.propose({ owner: 'acme', repo: 'acme/q', pr: 2, author: 'carol' }, d);
  queue.propose({ owner: 'alice', repo: 'alice/p', pr: 3, author: 'dan' }, d);
  queue.setStatus('alice/p#3', 'approved', d);
  const r = await grantsFor(authGh(), 'Bearer tA', null, d);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.pending.map(p => p.id), ['alice/p#1']);
  const o = await grantsFor(authGh({ admins: { tA: ['acme'] } }), 'Bearer tA', 'acme', d);
  assert.deepStrictEqual(o.body.pending.map(p => p.id), ['acme/q#2']);
  assert.strictEqual((await grantsFor(authGh(), 'Bearer tA', 'acme', d)).status, 403);
});

test('server /grants is read-only and 401 without auth', async () => {
  const srv = createServer({ secret: 's', gh: authGh(), dataDir: tmp() });
  await new Promise(r => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  assert.strictEqual((await fetch(base + '/grants')).status, 401);
  assert.strictEqual((await fetch(base + '/grants', { method: 'POST' })).status, 405);
  assert.strictEqual((await fetch(base + '/grants?owner=alice', { headers: { authorization: 'Bearer tA' } })).status, 200);
  srv.close();
});
