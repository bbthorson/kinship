# Kinship

A portable contact layer and a relationship-gardening engine on AT Protocol Spaces.
The product spec is [`docs/prd.md`](docs/prd.md); what it leaves open is
[`docs/open-questions.md`](docs/open-questions.md).

| Path | Component (PRD) | State |
|---|---|---|
| `lexicons/` | 1. Card lexicons | Record lexicons drafted; space-type lexicons wait for the beta |
| `packages/dunbar` | 4. Dunbar Daemon (the fold) | Built and tested: decay, impulse, caps, garden walk |
| `packages/core` | shared | Grant Ledger (reference-counted revocation), invite schemas |
| `apps/broker` | 3. Edge Broker | Hono Worker on D1: capped invites, approval queue, revocation. Caller auth and the PDS access check are stubs |
| `apps/mobile` | 2. Mobile client | Not started; see its README |

## Commands

Node 22 and npm 12 (`packageManager` pins 12.2.1; npm 10 cannot install this tree).

```bash
npm install
npm test            # vitest, every workspace
npm run typecheck
npm run dev:broker  # wrangler dev; set DEV_AUTH=true in apps/broker/.dev.vars to auth with an x-dev-did header
```

npm 12 skips install scripts by default, so before `wrangler dev` run
`npm install-scripts approve esbuild workerd`.
