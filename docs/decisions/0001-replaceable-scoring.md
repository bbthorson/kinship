# 0001: Relationship scoring is a replaceable algorithm

Status: accepted (2026-11-19).

The PRD's decay and impulse formulas are one opinion about relationships, not a fact about them.
Following Bluesky's custom feeds, the scoring is a choice the user makes, not something built
into the app.

## What is fixed and what is replaceable

| Fixed (the user's decisions) | Replaceable (an algorithm's opinion) |
|---|---|
| Rings and their hard caps (5/15/50/150), one-in-one-out | The score each contact gets |
| Evergreen, Mulch (snooze), Prune, `half_life_set` hints | Whether a contact is drifting |
| Who is eligible for the garden walk | The order drifting contacts are shown in, within a ring |
| The event log itself | How events are weighted |

So switching algorithms never moves anyone between rings, and no algorithm can surface a contact
the user marked evergreen, snoozed or dormant (`gardenWalk` enforces it).

## The contract

`packages/dunbar/src/algorithm.ts`. An `AlgorithmDefinition` has a reverse-DNS `id`, a `version`
(bumped when the same inputs would score differently), a Zod `params` schema whose every field
has a default, and `create(params)`. The resulting algorithm is a pure, deterministic
`fold(events, { now, from? })` returning a `Score` (0–100, plus `drifting`) per contact and an
opaque snapshot for incremental refolds.

The user's choice is an `AlgorithmPreference { algorithmId, params }`, stored sealed in the vault,
so it follows them across devices. A device that doesn't know the id (it was chosen on a newer
build) falls back to the default instead of failing. Invalid params also fall back, and report why.

Two algorithms ship:
- **`…halfLife`**, the PRD's: `V(t) = V0 · 2^(−Δt/t½)` between interactions, `V' = V + W·(1 − V/100)`
  per interaction. Ring half-lives, weights, the weekly light-signal cap and the threshold are all params.
- **`…cadence`**: no weights. A contact drifts when you've gone longer than their ring's interval
  without real contact. It's there partly to keep the contract honest: anything the garden walk
  needs has to come through the interface.

## Why local only, unlike Bluesky feeds

A Bluesky feed generator is a remote service that sees public posts. A Dunbar algorithm would
have to see the decrypted event log: who you meet, call and message, and how often. Sending that
to a third party undoes the vault's encryption. And an app can't download and run third-party
code on iOS. So algorithms are compiled into the app, and "choosing a feed" means choosing from
that built-in list.

Remote algorithms stay possible later, through the same interface, as an explicit opt-in that
shows what leaves the device. A more private variant would send only per-contact aggregates
(interaction counts per week, no identities). Not designed yet.
