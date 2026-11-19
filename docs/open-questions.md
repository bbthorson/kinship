# Open questions

What the PRD leaves open or gets wrong against what is known on 2026-11-19. The Spaces
facts come from Vox Pop's `specs/organizations.md` § 5 (checked 2026-11-14) and must be
re-checked once the 2026-12-01 beta docs are out.

## 1. Overlap with Vox Pop's mobile app (decide first)

Vox Pop's `apps/mobile` is already an Expo + op-sqlite "phone + contacts replacement": device
contacts imported via `expo-contacts`, a CRM with notes, tags, lifecycle, score and cadence, an
outbox sync engine, and a screening allowlist. That is most of PRD components 2 and 4 under another
name. Options:

- **Kinship = packages, Vox Pop = an app that uses them.** Lexicons, `dunbar`, `core` and the broker
  live here; Vox Pop's mobile app adopts them. Least duplicated work. The PRD's own mobile client
  becomes a later, thin app or nothing.
- **Kinship = its own app.** Two Expo apps maintaining two op-sqlite contact stores and two
  OS-contacts bridges. Only worth it if Kinship must ship without Vox Pop's branding or audience.

Vox Pop's CRM keeps its enrichment on the BFF (Postgres). Kinship's premise is that it's
E2EE in the user's vault. Adopting Kinship means moving those notes off the server.

## 2. The access check is a policy, not a callback

The PRD's "PDS `checkUserAccess` delegated to the broker" corresponds to the beta's
**managed space**: `com.atproto.managedspace.policy` with `managingApp` set to a `did#serviceId`
(never a bare DID). The alternative is a **member space** (`com.atproto.memberspace.policy`) whose
members the client sets with `putMembers` / `removeMembers` (100 per call). That's the PRD's
fallback and works with the phone offline once the members are written.

To verify after 2026-12-01:
- the XRPC a host calls on a managing app and its request/response (the broker's `/xrpc/*` is a 501 until then);
- whether Bluesky's PDS fleet supports managed spaces at all on day one. Some hosts implement only
  flat RBAC (opensocial.fyi had no managed-space policy on 2026-11-14);
- whether a member-space-only v1 is good enough: it needs the issuer's device (or the broker with
  a delegated session) to call `putMembers` on approval, which is fine for `manual` bundles and
  adds latency for `auto` ones.

## 3. Space URI format

Expected to change from `at://<authority>/space/…` to `at:space/<authority>/<type>/<skey>/…`
(about 75% likely as of 2026-11-14). Store `{ authority, type, skey }`, not URI strings, and build
URIs in one module.

## 4. "Spaces Jetstream"

Unverified that any firehose carries permissioned space records: they are not public, so a relay
can't fan them out to readers without credentials. Plan for per-space pulls with credentials,
triggered by a silent push from the broker (which knows who is allowed on what, not what changed).
This bears on Journey B and the iOS background-sync risk.

## 5. The .vcf fallback contradicts "zero PII"

The broker serves a one-time `.vcf` to non-Kinship recipients but stores no phone numbers. The
public base card has no channels, so a vCard built from it holds a name and links only. To include
a number, either the issuer's phone encrypts a vCard into the invite at creation (key in the URL
fragment, never sent to the broker), or the fallback is name + links only. The first keeps the
promise and is recommended.

## 6. Credential lifetime

The PRD says space credentials last 10–60 min. Delegation tokens in the beta are single-use and
live 60 s. Confirm which credential the reader holds and how it refreshes. It sets how often a
recipient's device talks to the issuer's PDS.

## 7. Space count

One space per channel per user, plus one per context, means a recipient of a two-bundle grant
holds credentials for perhaps 4–6 spaces per contact, times 150 contacts. Check per-host limits on
spaces per authority and the cost of a credential refresh at that fan-out, against the PRD's 1.5 s
QR-to-live target.

## 8. NSID domain

`app.kinship.*` requires control of `kinship.app` DNS. Confirm it's held, or rename now.

## 9. Broker caller auth

Callers authenticate with atproto inter-service auth JWTs (`aud` = the broker's DID, signed by
the caller's PDS signing key). Not built: `verifyCaller` is a stub, and the deployed worker
rejects everything unless `DEV_AUTH=true`. The broker also needs its own `did:web` for `aud` and
for `managingApp`.

## 10. Vault key recovery

Unchanged from the PRD. Note that a passkey PRF wrap needs PRF support on both platforms'
passkey providers. A recovery phrase is the floor regardless.
