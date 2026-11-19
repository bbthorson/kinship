# Open questions

Status as of 2026-11-19. Spaces facts come from Vox Pop's `specs/organizations.md` § 5
(checked 2026-11-14) and the [space sync](https://atproto.com/blog/space-sync) post. Re-check
after the 2026-12-01 beta docs are out.

## Settled

| # | Question | Answer |
|---|---|---|
| 1 | Kinship vs. Vox Pop's mobile contacts | Kinship **replaces** Vox Pop's contact management. See `apps/mobile/README.md` |
| 2 | Which Spaces model to build against | The 2026-12-01 beta. Live-sync users are on a Bluesky PDS that supports it. Policy choice: decision 0003 |
| 3 | `.vcf` fallback vs. zero PII | A sealed vCard: the issuer's phone encrypts it, the key travels in the URL fragment, the broker serves the ciphertext once. Built (`packages/core/src/sealed-vcf.ts`, `POST /i/:token/vcf`) |
| 4 | Is there a Jetstream for spaces? | Yes, through a sync service using delegated read access. Design: decision 0002 |
| 5 | Decay and impulse formulas | Replaceable algorithms, like Bluesky feeds. Built. Decision 0001 |

## Deferred, by choice

- **Opting out of Kinship's lexicons and spaces.** Someone using Vox Pop who doesn't want their
  contacts in `app.kinship.*` spaces. Not now. Keeping the Dunbar engine and the OS-contacts bridge
  free of any Spaces imports keeps this open: a "local-only" mode would use both without publishing.
- **Remote scoring algorithms.** Decision 0001, last section.

## Open

### Naming
Undecided, and this may become a Vox Pop feature rather than its own brand. `app.kinship.*` and
"Kinship" are **working names**. Lexicon ids are permanent once published, so the namespace must be
decided before Phase 1 publishes anything. If this becomes part of Vox Pop, the natural namespace
is `audio.voxpop.contact.*` under the domain Vox Pop already holds. Until then, code refers to
NSIDs only through `packages/core/src/nsid.ts`, so a rename touches that file and the lexicon JSON.

### Beta specifics to verify after 2026-12-01
- The OAuth scope that lets the broker call `putMembers` for auto bundles, and nothing more (decision 0003).
- Whether the 100-member limit is per call or per space.
- Sync-service method names, credential lifetime, cursor format (decision 0002). Where it runs
  (Durable Object vs. container) depends on the SDK.
- Space URI format: expected to move from `at://<authority>/space/…` to `at:space/<authority>/…`.
  Store `{ authority, type, skey }`, not URI strings.

### Space count
One space per channel plus one per context means a two-bundle grant is perhaps 4–6 spaces per
contact. Across 150 contacts, that's a lot of credentials for the sync service to hold and refresh.
Check per-authority space limits and refresh cost against the 1.5 s QR-to-live target.

### Broker caller auth
atproto inter-service auth JWTs (`aud` = the broker's DID). Not built: `verifyCaller` is a stub,
and the deployed worker rejects everything unless `DEV_AUTH=true`. The broker needs its own
`did:web`.

### Vault key recovery
A recovery phrase as the floor. Passkey PRF wrapping needs PRF support from both platforms' passkey
providers.

### Sealed vCard on React Native
`sealVcf` uses WebCrypto, which Hermes lacks. It needs `react-native-quick-crypto`, which Vox
Pop's mobile app would take on as a dependency.
