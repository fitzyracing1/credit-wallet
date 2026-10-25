'use strict';
// Webhook logic. Opt-in: only events carrying an installation are handled, and only for the
// repos in that installation. The only write this app ever makes is a CREDIT.json PR into the
// installer's own repo at install time. No comments, no issues, no messages to anyone else.
const { emptyWallet } = require('./wallet');
const queue = require('./queue');

const BRANCH = 'credit-wallet/add-wallet';

async function openWalletPr(gh, token, repoFullName) {
  const repo = await gh.req(token, 'GET', `/repos/${repoFullName}`);
  if (!repo) return { skipped: 'repo not visible to installation' };
  if (await gh.req(token, 'GET', `/repos/${repoFullName}/contents/CREDIT.json`)) return { skipped: 'CREDIT.json exists' };
  const base = repo.default_branch;
  const ref = await gh.req(token, 'GET', `/repos/${repoFullName}/git/ref/heads/${base}`);
  if (!(await gh.req(token, 'GET', `/repos/${repoFullName}/git/ref/heads/${BRANCH}`))) {
    await gh.req(token, 'POST', `/repos/${repoFullName}/git/refs`, { ref: `refs/heads/${BRANCH}`, sha: ref.object.sha });
  }
  const content = Buffer.from(JSON.stringify(emptyWallet(repoFullName), null, 2) + '\n').toString('base64');
  await gh.req(token, 'PUT', `/repos/${repoFullName}/contents/CREDIT.json`, { message: 'Add CREDIT.json wallet', content, branch: BRANCH });
  const pr = await gh.req(token, 'POST', `/repos/${repoFullName}/pulls`, {
    title: 'Add CREDIT.json wallet', head: BRANCH, base,
    body: 'You installed credit-wallet on this repo, so it is proposing a `CREDIT.json` wallet file (CREDIT-1/balance, empty).\n\nCredit is recognition only, not money. Close this PR to decline; the app will not reopen it.',
  });
  return { pr: pr && pr.html_url };
}

// Which repo gets the wallet PR: WALLET_REPO_NAME (e.g. "credit") if the installer selected it,
// otherwise only when exactly one repo was selected. Never guesses among many.
function chooseWalletRepo(repos, preferredName) {
  if (!repos || !repos.length) return null;
  if (preferredName) return repos.find(r => r.name === preferredName) || null;
  return repos.length === 1 ? repos[0] : null;
}

async function handle(event, payload, { gh, dataDir, walletRepoName = process.env.WALLET_REPO_NAME } = {}) {
  if (!payload || !payload.installation || !payload.installation.id) return { ignored: 'no installation (not opted in)' };

  if (event === 'installation' && payload.action === 'created') {
    const account = payload.installation.account && payload.installation.account.login;
    if (!payload.sender || payload.sender.login !== account) return { ignored: 'installer is not the account owner' };
    const target = chooseWalletRepo(payload.repositories, walletRepoName);
    if (!target) return { ignored: 'no single chosen repo; run `credit-wallet setup` yourself' };
    const token = await gh.installationToken(payload.installation.id);
    return openWalletPr(gh, token, target.full_name);
  }

  if (event === 'pull_request' && payload.action === 'closed' && payload.pull_request && payload.pull_request.merged) {
    const pr = payload.pull_request;
    const author = pr.user && pr.user.login;
    if (!author || (pr.user.type && pr.user.type !== 'User') || /\[bot\]$/.test(author)) return { ignored: 'bot author' };
    const owner = payload.repository.owner.login;
    if (author === owner) return { ignored: 'owner merged own PR' };
    const p = queue.propose({ owner, repo: payload.repository.full_name, pr: pr.number, author, title: pr.title, mergedAt: pr.merged_at }, dataDir);
    return p ? { queued: p.id } : { ignored: 'already queued' };
  }
  return { ignored: `${event}.${payload.action || ''}` };
}

module.exports = { handle, chooseWalletRepo, openWalletPr, BRANCH };
