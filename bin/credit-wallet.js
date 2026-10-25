#!/usr/bin/env node
'use strict';
const queue = require('../src/queue');
const { emptyWallet } = require('../src/wallet');
const fs = require('node:fs');

const USAGE = `credit-wallet <command>
  pending                     list UNSIGNED proposals awaiting your approval
  approve <owner/repo#N>      approve one; prints the \`credit give\` command for YOU to sign and run
  reject  <owner/repo#N>      drop one; nothing is granted
  setup <owner/repo> [--out CREDIT.json]
                              write an empty CREDIT.json locally for your own wallet repo.
                              Creating/pushing the repo is up to you (e.g. gh repo create).`;

function main(argv) {
  const [cmd, arg] = argv;
  switch (cmd) {
    case 'pending': {
      const list = queue.load().filter(p => p.status === 'proposed');
      if (!list.length) { console.log('no pending proposals'); return 0; }
      for (const p of list) console.log(`${p.id}\t@${p.to.id}\tweight ${p.weight}\t${p.for}`);
      return 0;
    }
    case 'approve': {
      const p = queue.setStatus(arg, 'approved');
      console.log(`approved ${p.id}. Nothing has been signed or posted. To grant, sign it yourself:`);
      console.log(queue.giveCommand(p));
      return 0;
    }
    case 'reject': { queue.setStatus(arg, 'rejected'); console.log(`rejected ${arg}`); return 0; }
    case 'setup': {
      const i = argv.indexOf('--out'); const out = i > 0 ? argv[i + 1] : 'CREDIT.json';
      if (fs.existsSync(out)) { console.log(`${out} exists; not overwriting`); return 1; }
      fs.writeFileSync(out, JSON.stringify(emptyWallet(arg), null, 2) + '\n');
      console.log(`wrote ${out}. Commit and push it to ${arg} yourself.`); return 0;
    }
    default: console.log(USAGE); return cmd ? 1 : 0;
  }
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(`dark: ${e.message}`); process.exitCode = 1; }
}
module.exports = { main };
