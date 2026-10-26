# credit-wallet

An **opt-in, approve-first** GitHub App for [CREDIT-1](https://github.com/fitzyracing1/credit) wallets.
Zero runtime dependencies. Node 20+. MIT.

Credit is recognition only. It is not money, a security, or a claim on anything.

## Opt-in

The app only ever sees repos where *you* installed it. Webhooks without an installation are ignored.

- **On install**, if the installer is the account owner and chose one repo (or the repo named by
  `WALLET_REPO_NAME`), the app opens a single PR adding an empty `CREDIT.json`
  (`CREDIT-1/balance`, same shape as `credit sync`). If `CREDIT.json` already exists, or the choice is
  ambiguous, it does nothing. Close the PR to decline.
- Prefer no app writes at all? Run the setup command yourself:
  `npx github:fitzyracing1/credit-wallet setup you/your-wallet-repo` writes `CREDIT.json` locally;
  you commit and push it.

## Approve-first

When a contributor's PR merges on an installed repo, the app writes an **unsigned proposal** to a
local pending queue (`$CREDIT_WALLET_DATA/pending.json`). That is all. Nothing is granted, signed,
posted, or commented. Bots and the owner's own PRs are skipped. Weight is capped at 100 (credit-1 schema).

```
credit-wallet pending                 # list proposals
credit-wallet approve alice/proj#7    # marks approved; prints the `credit give` command
credit-wallet reject  alice/proj#7
```

`approve` never signs. You sign with your own key using the `credit give` command from
fitzyracing1/credit; this app never holds or reads signing keys.

**The app never comments, opens issues, opens PRs in anyone else's repo, or messages non-installers.**

## Read-only grants API (for bots)

`GET /grants[?owner=<login>]` returns the caller's **pending, unsigned** proposals as JSON. No write endpoints exist.

```
curl -H "Authorization: Bearer $GITHUB_USER_TOKEN" \
  https://credit-wallet-production.up.railway.app/grants
# {"owner":"alice","installation":123,"pending":[{"id":"alice/proj#7","to":{...},"weight":1,...}]}
```

The server checks the token with GitHub (`GET /user`). `owner` defaults to the token's login; an org
`owner` requires an active admin membership. The app must be installed on that account. Otherwise:
401 (no/invalid token), 403 (not yours or not installed). Tokens are used only for those checks and never stored or logged.
A bot (e.g. a Grok Bot "Money" template) should use the installer's own token, read-only scope is enough
(`read:org` only if checking an org).

## Run

```
WEBHOOK_SECRET=... APP_ID=... PRIVATE_KEY_PATH=/path/key.pem npm start   # POST /webhook, GET /healthz
npm test
```

The private key can be given as `PRIVATE_KEY_BASE64`, `PRIVATE_KEY` (PEM), or `PRIVATE_KEY_PATH`.
Secrets come from the environment and are never logged.

## Registration, Origin app packaging, and marketplace submission

None of this has been done; it needs Joshua.

1. **Register**: edit `app.yml` (set `hook_attributes.url` to the deployed `/webhook`), then create the
   app via GitHub's manifest flow (Settings → Developer settings → GitHub Apps → New, or
   `POST https://github.com/settings/apps/new` with the manifest). Save the App ID, webhook secret, and
   private key in your secret store, never in the repo.
2. **Deploy**: run `npm start` on any Node 20 host with `WEBHOOK_SECRET`, `APP_ID`, `PRIVATE_KEY_PATH`,
   and a persistent `CREDIT_WALLET_DATA` directory.
3. **Origin app packaging**: package the repo as an Origin app (app manifest = `app.yml`, entrypoint
   `src/server.js`, health check `/healthz`, persistent volume for `CREDIT_WALLET_DATA`, secrets as env).
   Follow Origin's current packaging docs; nothing Origin-specific is committed here yet.
4. **GitHub Marketplace**: make the app public, add a logo, description, privacy policy and support URL,
   verify the publisher org, then submit the listing (free plan) for GitHub review.

## License

MIT © 2026 Joshua Almeida

## Plans

This project is free, and its license stays as is. Support it through [GitHub Sponsors](https://github.com/sponsors/fitzyracing1):

- **Free**: use the code, community support.
- **Pro ($49/month)**: priority issues and support.
- **Team ($199/month)**: priority support for your team plus early access.
