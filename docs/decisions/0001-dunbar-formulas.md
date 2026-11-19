# 0001: Dunbar decay and impulse formulas

Status: accepted (2026-11-19). The PRD names both formulas but the equations were lost from the draft.

**Decay.** `V(t) = V0 · 2^(−Δt / t½)`. Half-life form, so the ring defaults (7/21/60/180 days)
read directly: a support-clique contact at 50 is at 25 a week later. `Δt` excludes snoozed time.
Evergreen and dormant freeze it. `customHalfLifeDays` overrides the ring.

**Impulse.** `V' = V + W · (1 − V/100)`. Bounded in [0, 100] without clamping artefacts, and
diminishing: an in-person meeting (+45) takes a cold contact from 0 to 45, a warm one from 80 to 89.

**Light-signal cap.** Likes/reposts give +2 each up to +6 of weight per week bucket
`floor(at / 7d)` (epoch weeks, which start Thursday UTC). Cheap and deterministic across devices;
switch to the user's locale week only if it is visibly wrong.

**Order.** The fold sorts by tid, not by `at`. An interaction logged late (tid now, `at` last
Tuesday) applies at the fold's current time rather than rewriting history, which keeps the fold
single-pass and identical on every device. A new contact starts at 50.

Implementation: `packages/dunbar/src/engine.ts`. 10,000 events fold well under the 50 ms target.
