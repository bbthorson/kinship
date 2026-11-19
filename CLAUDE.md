# CLAUDE.md

Kinship: contacts on AT Protocol Spaces. Read `README.md`, then `docs/prd.md` and
`docs/open-questions.md` before designing anything.

- npm workspaces, npm 12, Node 22. `npm test`, `npm run typecheck`.
- Tests are colocated `*.test.ts`; import `describe`/`it`/`expect` from `vitest`, use `it`.
- Zod for every input and every DB row read. No `any`, no raw casts.
- Broker responses: `{ success: true, data }` or `{ success: false, error: { message, code? } }`.
- The broker stores no contact PII: DIDs, opaque space refs and token hashes only.
- Vault and Dunbar records are sealed on device; their plaintext shapes live in
  `packages/core` and `packages/dunbar`, never in a lexicon.
- Spaces beta details move fast. Check `docs/open-questions.md` before relying on a
  protocol name, and record what you verify there with a date.
