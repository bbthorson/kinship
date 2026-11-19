import { z } from 'zod';
import type { AlgorithmDefinition, Score, VitalityAlgorithm } from '../algorithm';
import { DAY_MS, DEFAULT_MULCH_DAYS, type DunbarEvent, type Ring, sortedByTid, WEEK_MS } from '../model';

/**
 * The PRD's algorithm: exponential decay with bounded impulses.
 *
 *   Decay:   V(t) = V0 · 2^(−Δt / t½)
 *            Δt excludes snoozed time. t½ = the contact's custom half-life,
 *            else the ring's. Evergreen and dormant contacts don't decay.
 *   Impulse: V' = V + W · (1 − V / 100)
 *            Diminishing returns keep V in [0, 100]: an in-person meeting
 *            takes a cold contact from 0 to 45, a warm one from 80 to 89.
 *
 * Likes/reposts ("light" signals) count up to `lightWeeklyCap` of weight per
 * epoch week, floor(at / 7d). The fold is single-pass in tid order, so an
 * interaction logged late applies at the fold's current time.
 */

const ringHalfLives = z
  .object({
    support: z.number().positive().default(7),
    sympathy: z.number().positive().default(21),
    affinity: z.number().positive().default(60),
    clan: z.number().positive().default(180),
  })
  .prefault({});

const weights = z
  .object({
    in_person: z.number().min(0).max(100).default(45),
    call_long: z.number().min(0).max(100).default(30),
    dm_thread: z.number().min(0).max(100).default(15),
    atproto_reply: z.number().min(0).max(100).default(8),
    atproto_like: z.number().min(0).max(100).default(2),
  })
  .prefault({});

export const HalfLifeParams = z.object({
  halfLifeDays: ringHalfLives,
  weights,
  lightWeeklyCap: z.number().min(0).default(6),
  driftThreshold: z.number().min(0).max(100).default(25),
  initialVitality: z.number().min(0).max(100).default(50),
});
export type HalfLifeParams = z.infer<typeof HalfLifeParams>;

interface Contact {
  ring: Ring;
  vitality: number;
  asOf: number;
  snoozedUntil: number | null;
  evergreen: boolean;
  customHalfLifeDays: number | null;
  lightSpent: Map<number, number>;
}

export type HalfLifeSnapshot = Map<string, Contact>;

export function applyImpulse(v: number, weight: number): number {
  return Math.min(100, Math.max(0, v + weight * (1 - v / 100)));
}

function create(p: HalfLifeParams): VitalityAlgorithm<HalfLifeSnapshot> {
  const halfLife = (c: Contact): number | null => {
    if (c.evergreen || c.ring === 'dormant') return null;
    return c.customHalfLifeDays ?? p.halfLifeDays[c.ring];
  };

  const valueAt = (c: Contact, t: number): number => {
    const hl = halfLife(c);
    if (hl === null || t <= c.asOf) return c.vitality;
    // A snooze always starts "now", so it covers [asOf, snoozedUntil).
    const start = c.snoozedUntil !== null && c.snoozedUntil > c.asOf ? c.snoozedUntil : c.asOf;
    const dt = Math.max(0, t - start);
    return c.vitality * Math.pow(2, -dt / (hl * DAY_MS));
  };

  const advance = (c: Contact, t: number) => {
    if (t <= c.asOf) return;
    c.vitality = valueAt(c, t);
    c.asOf = t;
    if (c.snoozedUntil !== null && c.snoozedUntil <= t) c.snoozedUntil = null;
  };

  const apply = (c: Contact, e: DunbarEvent) => {
    advance(c, e.at);
    switch (e.type) {
      case 'interaction': {
        let w = p.weights[e.kind];
        if (e.kind === 'atproto_like') {
          const week = Math.floor(e.at / WEEK_MS);
          const spent = c.lightSpent.get(week) ?? 0;
          w = Math.min(w, p.lightWeeklyCap - spent);
          if (w <= 0) return;
          c.lightSpent.set(week, spent + w);
        }
        c.vitality = applyImpulse(c.vitality, w);
        c.snoozedUntil = null;
        return;
      }
      case 'tier_set': c.ring = e.ring; return;
      case 'snooze': c.snoozedUntil = e.at + (e.days ?? DEFAULT_MULCH_DAYS) * DAY_MS; return;
      case 'prune': c.ring = 'dormant'; c.snoozedUntil = null; return;
      case 'evergreen_set': c.evergreen = e.evergreen; return;
      case 'half_life_set': c.customHalfLifeDays = e.days; return;
    }
  };

  return {
    id: halfLifeAlgorithm.id,
    version: halfLifeAlgorithm.version,
    fold(events, { now, from }) {
      const state: HalfLifeSnapshot = new Map();
      if (from) for (const [k, c] of from) state.set(k, { ...c, lightSpent: new Map(c.lightSpent) });
      for (const e of sortedByTid(events)) {
        let c = state.get(e.contactId);
        if (!c) {
          c = { ring: 'clan', vitality: p.initialVitality, asOf: e.at, snoozedUntil: null, evergreen: false, customHalfLifeDays: null, lightSpent: new Map() };
          state.set(e.contactId, c);
        }
        apply(c, e);
      }
      const scores = new Map<string, Score>();
      for (const [id, c] of state) {
        const score = valueAt(c, now);
        scores.set(id, { score, drifting: score < p.driftThreshold });
      }
      return { scores, snapshot: state };
    },
  };
}

export const halfLifeAlgorithm: AlgorithmDefinition<HalfLifeParams, HalfLifeSnapshot> = {
  id: 'app.kinship.algorithm.halfLife',
  version: 1,
  label: 'Vitality (half-life)',
  description: 'Every interaction tops a contact up; closeness fades by half each half-life of the ring. The PRD default.',
  params: HalfLifeParams,
  create,
};
