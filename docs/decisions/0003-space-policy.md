# 0003: Channel and context spaces are member spaces on the Bluesky PDS

Status: proposed (2026-11-19). Planning assumption: the 2026-12-01 beta is the model, and every
issuer whose cards sync live has an account on a Bluesky PDS that supports it.

The beta offers three space policies: `com.atproto.personalspace.policy`,
`com.atproto.memberspace.policy` (members set with `com.atproto.memberspace.putMembers` /
`removeMembers`, 100 per call) and `com.atproto.managedspace.policy` (a `managingApp`, given as a
`did#serviceId`, decides access).

| Space | Policy |
|---|---|
| Vault (`skey: self`) | personal space |
| Channel, context | **member space** |

**Why member space, not managed space.** The membership calls are published. The managing-app
access check isn't yet, and it would make the broker a dependency of every credential refresh:
if the broker goes down, every recipient's live updates stop. With a member space, the PDS holds
the member list and the broker is only needed while an invite is redeemed. That matches the sync
model in 0002, where the authority decides membership.

**Who calls `putMembers`.** On approval the call must be made as the issuer:
- *Manual bundles.* The issuer's phone, when they tap Approve. It's online at that moment by definition.
- *Auto bundles.* The broker, using an OAuth session the issuer granted with space-membership
  scope limited to Kinship's space types. The broker then holds a token that can change the
  membership of the issuer's Kinship spaces, and nothing else. If no scope is that narrow, auto
  bundles fall back to a silent push that has the issuer's phone make the call, at the cost of
  latency while it's offline.

Revocation is `removeMembers` for the spaces the Grant Ledger says to drop (Journey C), from the
phone. The broker's allowlist then mirrors the PDS member lists instead of being authoritative. It
stays useful for redemption checks and as the sync service's `space → recipients` index.

Check after 2026-12-01: the scope grammar for membership calls, and whether the 100-member cap
applies per call or per space. One channel space shared with more than 100 people would hit the latter.
