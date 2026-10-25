'use strict';
const crypto = require('node:crypto');

// Verify X-Hub-Signature-256 in constant time. Never logs the secret.
function verifySignature(secret, rawBody, header) {
  if (!secret || !header || !header.startsWith('sha256=')) return false;
  const want = Buffer.from('sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex'));
  const got = Buffer.from(header);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

module.exports = { verifySignature };
