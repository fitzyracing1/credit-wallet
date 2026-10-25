'use strict';
// Pending queue of UNSIGNED proposals. Local JSON files only; nothing is granted here.
const fs = require('node:fs');
const path = require('node:path');
const { clampWeight } = require('./wallet');

function dir(base) { const d = base || process.env.CREDIT_WALLET_DATA || path.join(process.cwd(), '.data'); fs.mkdirSync(d, { recursive: true }); return d; }
function file(base) { return path.join(dir(base), 'pending.json'); }
function load(base) { try { return JSON.parse(fs.readFileSync(file(base), 'utf8')); } catch { return []; } }
function save(list, base) { const f = file(base); fs.writeFileSync(f + '.tmp', JSON.stringify(list, null, 2) + '\n'); fs.renameSync(f + '.tmp', f); }

function propose({ owner, repo, pr, author, title = '', weight = 1, mergedAt }, base) {
  const id = `${repo}#${pr}`;
  const list = load(base);
  if (list.some(p => p.id === id)) return null; // idempotent on webhook redelivery
  const reason = `PR ${id}${String(title).trim() ? ': ' + String(title).trim() : ''}`.slice(0, 200);
  const p = {
    id, credit: 'CREDIT-1/proposal', status: 'proposed', signed: false, owner,
    to: { type: 'github', id: author }, for: reason, weight: clampWeight(weight),
    date: (mergedAt || new Date().toISOString()).slice(0, 10), repo, pr,
  };
  list.push(p); save(list, base); return p;
}

function setStatus(id, status, base) {
  const list = load(base);
  const p = list.find(x => x.id === id);
  if (!p) throw new Error(`no proposal ${id}`);
  if (p.status !== 'proposed') throw new Error(`${id} is already ${p.status}`);
  p.status = status; p.decidedAt = new Date().toISOString();
  save(list, base); return p;
}

// The owner signs with their own key via the credit CLI; this app never holds signing keys.
function giveCommand(p) {
  return `node cli/credit.js give ${p.to.id} ${p.weight} --for "${p.for.replace(/["`\\$]/g, '')}"`;
}

module.exports = { load, propose, setStatus, giveCommand };
