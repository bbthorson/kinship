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
| `apps/broker` | 3. Edge Broker | Hono Worker on D1: capped invites, approval queue, revocation, the one-time sealed-vCard page, atproto service-auth sign-in |
| (not started) | Space sync | Live updates via a space sync service: `docs/decisions/0002-space-sync.md` |
| `apps/mobile` | 2. Mobile client | No separate app: Vox Pop's mobile app adopts these packages. Plan in its README |

## Commands

Node 22 and npm 12 (`packageManager` pins 12.2.1; npm 10 cannot install this tree).

```bash
npm install
npm test            # vitest, every workspace
npm run typecheck
npm run dev:broker  # wrangler dev; DEV_AUTH=true in apps/broker/.dev.vars trusts an x-dev-did header instead of service auth
```

npm 12 skips install scripts by default, so before `wrangler dev` run
`npm install-scripts approve esbuild workerd`.

CI (`.github/workflows/ci.yml`) runs typecheck, tests and a dry-run bundle of the broker as one
check named `ci`.

## Calling the broker

Every authenticated route takes an atproto **service-auth** token:
`Authorization: Bearer <jwt>`. The client gets one from its own PDS with
`com.atproto.server.getServiceAuth`, passing `aud` = the broker's DID and `lxm` = the method in
`BROKER_METHOD` (`packages/core/src/nsid.ts`). Tokens are single-use, bound to one method, and live
at most an hour. An OAuth client needs `rpc:<method>?aud=<broker DID>` in its scope.
