---
status: draft
version: 1.0
---

# The Kinship Suite — Product Requirements

Target protocol milestone: AT Protocol Spaces Public Beta (2026-12-01). Target end-user launch: Q1 2027.

> Recorded as received on 2026-11-19. Where it conflicts with `docs/open-questions.md` or a
> decision in `docs/decisions/`, those win. Since then: Kinship replaces Vox Pop's contact
> management instead of shipping its own app; scoring is replaceable (decision 0001); live sync
> goes through a space sync service (0002); channel and context spaces are member spaces (0003).

## 1. Executive summary & suite philosophy

Modern mobile address books are broken by two structural flaws: **static data rot** (every user
maintains stale, siloed copies of everyone else's phone numbers and addresses) and **context
decay** (contact lists hoard thousands of names with zero relational memory or maintenance loop).

Kinship decouples the portable identity/contact layer from the opinionated relationship-gardening
engine, built natively on AT Protocol Spaces, as four composable components:

| Component | Role | Runtime | Interop boundary |
|---|---|---|---|
| 1. Card lexicons | Public base cards, atomic channels, context facets | PDS + Spaces | Adoptable by any dialer, mail or calendar app |
| 2. Mobile client | Local-first address book, OS Contacts bridge, UI | Expo + op-sqlite | iOS & Android; offline-first join layer |
| 3. Edge broker | Capped QR/link invites, approval queue, access-check responder | Cloudflare Workers (Hono) | Thin edge service; holds zero contact PII |
| 4. Dunbar daemon | Event-sourced decay engine and pruning loop | Local op-sqlite worker + E2EE vault space | Subscribes to signals, writes append-only tid logs |

**Principles**

- **Bilateral subscriptions, not shared authorities.** Each user publishes to their own outbound
  spaces and grants read credentials to the other; revocation stays unilateral.
- **Split channels + bundled presets.** Atomic facts (cell, home address, work email) each live in
  their own space. Contexts (Work, Rugby, Sci-Fi) live in context spaces, shared via named bundles.
- **Day-one utility for the 95%.** Native OS contacts are first-class shadow contacts that upgrade
  to live space feeds when a DID is linked.
- **Access control ≠ confidentiality.** Contact/context spaces use Spaces' plaintext access
  perimeter for interop. Private notes, shadow contacts, grant ledgers and Dunbar logs are app-layer
  E2EE before they reach the user's single-user vault space.

## 2. Personas & journeys

**Personas.** The multi-context networker (primary): distinct circles, wants to share Work with
clients and Rugby + Cell with teammates without duplicate cards or leaking a home address. The
intentional gardener: maintains the 5/15/50/150 rings without daily guilt or manual CRM entry. The
non-ATProto recipient: scans a QR and needs to save details with no app and no account.

- **A. The 5-second bar handshake.** Share → Rugby Teammate (Personal Cell + Rugby Context, 1 use,
  24 h, auto-approve). A Kinship recipient subscribes to both spaces at once and gets a 1-tap prompt
  to reciprocate; the issuer gets a push with 1-tap Revoke. A non-Kinship recipient lands on the
  public base card and an optional one-time `.vcf`.
- **B. Moving apartments.** One update to the Home Address channel space reaches every authorised
  recipient, whose client patches op-sqlite and the native OS contact in the background.
- **C. Context-safe revocation.** Revoking Rugby from Bob checks the grant ledger, sees Bob still
  holds Sci-Fi (which also includes Personal Cell), revokes Rugby Context only.
- **D. The weekly garden walk.** Sunday, 3–5 contacts whose vitality fell below 25, triaged by
  4-way swipe: Water (reach out), Mulch (snooze 30 days), Repot (demote a ring), Prune (archive +
  optional revocation).

## 3. Functional requirements

### Component 1: lexicons

Space-type NSIDs are OAuth consent boundaries, so schemas are split so a third-party app can ask
for card access without ever asking for the vault:

- `app.kinship.card.profile` — public base card (`literal:self`): display name, pronouns, bio, avatar, up to 12 links.
- `app.kinship.space.channel` / `app.kinship.card.channel` — one space per atomic channel (phone, email, address, birthday, messaging, as an open union).
- `app.kinship.space.context` / `app.kinship.card.context` — one space per context (name, nickname, role, organization, avatarOverride, links).
- `app.kinship.space.vault` — single-user space (skey `self`), app-layer E2EE, holding
  `app.kinship.vault.contact` (shadow profiles, linked DIDs, private notes, caller-ID override),
  `app.kinship.vault.bundle` (bundle → spaceRefs + approval policy),
  `app.kinship.vault.grant` (targetDidHash → activeBundles, for reference-counted revocation) and
  `app.kinship.dunbar.event` (key `tid`, append-only).

**skey opacity.** Channel and context spaces MUST use TIDs or random base32 skeys, never
human-readable slugs. Labels live inside the gated record.

### Component 2: mobile client

- **Join layer.** op-sqlite is the single read store joining public cards, inbound channel/context
  spaces and decrypted vault overlays.
- **Scalar collision rule.** Conflicting scalars (nickname, avatarOverride) across contexts resolve
  by: the user's override in `vault.contact`, then the most recently interacted context (from Dunbar
  logs), then the public base card.
- **OS contacts bridge — split ownership, never bidirectional.** Shadow contacts
  (`sourceOfTruth = 'native'`) are read from OS contacts with content-hash diffing; Kinship edits
  patch the OS contact granularly. Live contacts (`sourceOfTruth = 'atproto'`) push one way into a
  dedicated "Kinship" group/account so Caller ID, iMessage, CarPlay and Android Auto resolve live
  numbers.
- **iOS 18 limited access.** Support `ContactAccessButton` and `presentAccessPicker()`.
- **No native notes field** (avoids the restricted notes entitlement: Expo's `ios.accessesContactNotes`). Notes live in `vault.contact`.
- **Shadow-to-live upgrade** keeps the local UUID, notes and Dunbar history, flips
  `sourceOfTruth`, and patches the native contact in place.

### Component 3: edge broker

- **Capped invites.** `https://kinship.app/i/{token}` bound to
  `{ issuerDid, bundleId, spaceRefs[], maxUses, expiresAt, approvalMode, allowVcfFallback }`.
  `maxUses` enforced atomically. Browsers get the public card and, only if `allowVcfFallback`, a
  one-time `.vcf` (default false for high-trust bundles).
- **Tiered approval.** The broker is the always-on policy responder so credentials can be minted
  while the issuer's phone is offline. `auto`: redeeming adds the recipient to the allowlist and
  pushes the issuer a Revoke action. `manual`: redeeming queues a request; nothing is granted until
  the issuer approves.

### Component 4: Dunbar daemon

- **Event-sourced.** Folds `app.kinship.dunbar.event` in tid order, locally.
- **Decay and impulse.** Vitality V ∈ [0, 100] decays exponentially between interactions; each
  interaction applies a bounded weight. (Equations, and how they became one replaceable algorithm among several: decision 0001.)
- **Rings.** Support clique (cap 5, t½ 7 d), sympathy group (15, 21 d), affinity band (50, 60 d),
  active clan (150, 180 d), dormant (∞, frozen, excluded from pruning).
- **Weights.** In person +45, call > 10 min +30, DM thread +15, ATProto reply/mention +8, like/repost +2 (capped +6/week).
- **Evergreen escape valve.** Per-contact `customHalfLifeDays` or `evergreen: true`.
- **One-in, one-out.** Promoting into a full ring requires repotting a member down one ring.
- **Weekly garden walk.** No daily badges. Weekly (configurable), 3–5 contacts below V < 25:
  Water (deep-link + log), Mulch (pause Δt 30 days), Repot (`tier_set` down), Prune (dormant +
  optional revocation via the grant ledger).

## 4. Security, privacy & threat model

| Asset | Where | Protection | Mitigates |
|---|---|---|---|
| Public base card | Public repo | Public by design | — |
| Channel & context spaces | Outbound spaces | Spaces access control, opaque skeys, short-lived credentials | Scraping; URI metadata leakage |
| Vault & Dunbar logs | Single-user vault space | App-layer E2EE (XChaCha20-Poly1305), device-held key | A curious or compromised PDS host |
| Broker state | D1 / Durable Objects | `{ issuerDid, spaceRef, allowedDid }` allowlists and hashed tokens only | A broker breach leaks no numbers, addresses or notes |

- **Key management.** Generated on first launch, in Keychain / Keystore, with a recovery phrase or passkey-wrapped backup for multi-device.
- **Known limitation.** Revocation stops future updates; it doesn't wipe cached numbers. UI copy
  frames spaces as live-update subscriptions, not DRM.

## 5. Stack & non-functional requirements

Expo (CNG), React Native, TypeScript, op-sqlite, expo-contacts, NativeWind; `@atproto/lex`,
`@atproto/space`, `@atproto/oauth-client-expo`; Cloudflare Workers, Hono, D1 / Durable Objects.

- Cold launch to searchable list < 300 ms.
- QR scan to subscribed live card < 1.5 s on LTE.
- Full fold of 10,000 Dunbar events < 50 ms.
- Offline: every read, note edit and Dunbar log works offline and reconciles deterministically.

## 6. Phased rollout

1. **Foundation & beta integration (Dec 2026).** Publish lexicons and validate against the beta
   reference PDS; Expo + op-sqlite store, OAuth, encrypted vault sync; shadow contacts and iOS 18
   limited access.
2. **Handshakes & broker (Jan 2027).** Broker with capped invites, `.vcf` fallback and the access
   check; channels, contexts, bundles, grant-ledger revocation; background sync into OS contacts.
3. **Dunbar & ecosystem (Feb–Mar 2027).** Decay engine, slot caps, garden walk UI; passive
   Bluesky reply/mention ingestion; open the `app.kinship.card.*` lexicons for third parties.

## 7. Open questions & risks (as written in the PRD)

- **Access-check standardisation** — the exact contract for delegating access checks from stock
  PDSs to an external broker; fallback is the client pushing allowlist updates to its PDS.
- **iOS background throttling** — live updates need silent pushes from the broker or sync on open.
- **Vault key recovery** — recovery phrase vs. iCloud Keychain / passkey PRF wrapping.

The current list, with what is known, is `docs/open-questions.md`.
