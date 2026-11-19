# Kinship

A portable contact layer and a relationship-gardening engine on AT Protocol Spaces, built to
replace Vox Pop's contact management. "Kinship" and `app.kinship.*` are working names; this may
end up as a Vox Pop feature (`docs/open-questions.md` § Naming).
The product spec is [`docs/prd.md`](docs/prd.md); what it leaves open is
[`docs/open-questions.md`](docs/open-questions.md).

| Path | Component (PRD) | State |
|---|---|---|
| `lexicons/` | 1. Card lexicons | Record lexicons drafted; space-type lexicons wait for the beta |
| `packages/dunbar` | 4. Dunbar Daemon | Built: rings and caps, garden walk, and replaceable scoring algorithms (half-life, cadence) |
| `packages/core` | shared | Grant Ledger (reference-counted revocation), invite schemas, sealed vCards, the NSID map |
| `apps/broker` | 3. Edge Broker | Hono Worker on D1: capped invites, approval queue, revocation, the one-time sealed-vCard page. Caller auth is a stub |
| (not started) | Space sync | Live updates via a space sync service: `docs/decisions/0002-space-sync.md` |
| `apps/mobile` | 2. Mobile client | No separate app: Vox Pop's mobile app adopts these packages. Plan in its README |

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
