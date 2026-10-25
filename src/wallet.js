'use strict';
// CREDIT.json wallet file, same shape as fitzyracing1/credit `credit sync` (CREDIT-1/balance).
const DEFAULT_LEDGER = 'https://raw.githubusercontent.com/fitzyracing1/credit/main/ledger/grants.jsonl';
const NOTE = 'Credit is recognition only. It is not money, a security, or a claim on anything.';
const MAX_WEIGHT = 100; // credit-1 schema caps weight at 100

function emptyWallet(repoFullName, ledger = DEFAULT_LEDGER) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repoFullName || '')) throw new Error('repo must be owner/repo');
  return {
    credit: 'CREDIT-1/balance',
    recipient: { type: 'repo', id: repoFullName },
    balance: 0, grants: 0, from: {}, ledger, head: null, last: [], note: NOTE,
  };
}

function clampWeight(n) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 1) return 1;
  return Math.min(v, MAX_WEIGHT);
}

module.exports = { emptyWallet, clampWeight, MAX_WEIGHT, DEFAULT_LEDGER, NOTE };
