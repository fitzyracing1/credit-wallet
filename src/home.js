'use strict';
// Self-contained homepage. No external scripts, styles, fonts, or images.
const HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>credit-wallet</title>
<style>
body{font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:42rem;margin:3rem auto;padding:0 1.25rem;color:#1d1d1f;background:#fbfbf8}
h1{font-size:2rem;margin:0 0 .25rem}h2{font-size:1.1rem;margin-top:2rem}
.sub{color:#555;margin-top:0}.status{display:inline-block;padding:.2rem .6rem;border-radius:1rem;background:#fff6cc;border:1px solid #e3c800;font-weight:600}
code{background:#eee;padding:.1rem .3rem;border-radius:.25rem}a{color:#0b57d0}footer{margin-top:3rem;color:#777;font-size:.9rem}
</style></head><body>
<h1>credit-wallet</h1>
<p class="sub">An opt-in, approve-first GitHub App for CREDIT-1 wallets.</p>
<p>Health: <span class="status" id="health">lit</span></p>
<h2>What it is</h2>
<p>credit-wallet helps maintainers recognize contributors with CREDIT-1 credit. Credit is recognition only. It is not money, a security, or a claim on anything.</p>
<h2>Opt-in install</h2>
<p>The app only acts on repositories where you installed it. On install it may open one pull request in your own chosen repo adding an empty <code>CREDIT.json</code> wallet. Close it to decline.</p>
<h2>Approve-first, unsigned grants</h2>
<p>When a contributor's pull request merges, the app records an <strong>unsigned proposal</strong> in a pending queue. Nothing is granted, signed, or posted until the owner approves, and the owner signs with their own key.</p>
<h2>Never contacts non-installers</h2>
<p>No comments, issues, pull requests, or messages are ever sent to anyone who did not install the app.</p>
<footer>Source: <a href="https://github.com/fitzyracing1/credit-wallet">github.com/fitzyracing1/credit-wallet</a> &middot; MIT &copy; 2026 Joshua Almeida &middot; <a href="/healthz">/healthz</a></footer>
</body></html>
`;
module.exports = { HTML };
