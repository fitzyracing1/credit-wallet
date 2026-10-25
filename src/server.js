'use strict';
const http = require('node:http');
const { verifySignature } = require('./verify');
const { handle } = require('./handler');
const { client } = require('./github');
const { HTML } = require('./home');

function createServer({ secret = process.env.WEBHOOK_SECRET, gh = client(), dataDir } = {}) {
  if (!secret) throw new Error('WEBHOOK_SECRET is required');
  return http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') { res.end('lit\n'); return; }
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(HTML); return; }
    if (req.method !== 'POST' || req.url !== '/webhook') { res.statusCode = 404; res.end(); return; }
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      const raw = Buffer.concat(chunks);
      if (!verifySignature(secret, raw, req.headers['x-hub-signature-256'])) { res.statusCode = 401; res.end('bad signature\n'); return; }
      try {
        const out = await handle(req.headers['x-github-event'], JSON.parse(raw.toString('utf8')), { gh, dataDir });
        res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(out));
      } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: e.message })); }
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, () => console.log(`credit-wallet listening on :${port}`));
}

module.exports = { createServer };
