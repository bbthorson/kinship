import {
  DAY_MS,
  type ContactVitality,
  type DunbarEvent,
  INTERACTION_WEIGHTS,
  LIGHT_SIGNALS,
  LIGHT_SIGNAL_WEEKLY_CAP,
  MULCH_DAYS,
  RING_CONFIG,
  WEEK_MS,
} from './model';

/**
 * Formulas. The PRD names a decay and an impulse formula but the equations
 * were lost in the draft, so these are the ones chosen here (docs/decisions/0001):
 *
 *   Decay:   V(t) = V0 · 2^(−Δt / t½)
 *            Δt excludes any time spent snoozed (Mulch pauses Δt).
 *            t½ = customHalfLifeDays ?? the ring default; evergreen or
 *            dormant freezes decay entirely.
 *
 *   Impulse: V' = V + W · (1 − V / 100)
 *            Diminishing returns: weight lands in full on a cold contact and
 *            only partially on a warm one, so V never leaves [0, 100] and
 *            spamming interactions cannot max a score instantly.
 */

/** New contacts start at the threshold-safe midpoint so they don't drift on day one. */
export const INITIAL_VITALITY = 50;

export function newContact(contactId: string, at: number): ContactVitality {
  return {
    contactId,
    ring: 'clan',
    vitality: INITIAL_VITALITY,
    asOf: at,
    lastInteractionAt: null,
    snoozedUntil: null,
    evergreen: false,
    customHalfLifeDays: null,
    lightSpent: new Map(),
  };
}

export function halfLifeDays(c: ContactVitality): number | null {
  if (c.evergreen) return null;
  if (c.ring === 'dormant') return null;
  return c.customHalfLifeDays ?? RING_CONFIG[c.ring].halfLifeDays;
}

/** Elapsed decaying time between `from` and `to`, minus any snoozed span. */
function decayingSpan(c: ContactVitality, from: number, to: number): number {
  if (to <= from) return 0;
  if (c.snoozedUntil === null || c.snoozedUntil <= from) return to - from;
  // Snooze started at or before `from` (we only ever snooze "from now").
  return Math.max(0, to - Math.max(from, c.snoozedUntil));
}

/** Pure: the contact's vitality at time `t`, without mutating it. */
export function vitalityAt(c: ContactVitality, t: number): number {
  const hl = halfLifeDays(c);
  if (hl === null) return c.vitality;
  const dt = decayingSpan(c, c.asOf, t);
  return c.vitality * Math.pow(2, -dt / (hl * DAY_MS));
}

/** Advance the contact to time `t` in place. */
function advance(c: ContactVitality, t: number): void {
  if (t <= c.asOf) return;
  c.vitality = vitalityAt(c, t);
  c.asOf = t;
  if (c.snoozedUntil !== null && c.snoozedUntil <= t) c.snoozedUntil = null;
}

export function applyImpulse(v: number, weight: number): number {
  const next = v + weight * (1 - v / 100);
  return Math.min(100, Math.max(0, next));
}

function apply(c: ContactVitality, e: DunbarEvent): void {
  advance(c, e.at);
  switch (e.type) {
    case 'interaction': {
      let w: number = INTERACTION_WEIGHTS[e.kind];
      if (LIGHT_SIGNALS.has(e.kind)) {
        const week = Math.floor(e.at / WEEK_MS);
        const spent = c.lightSpent.get(week) ?? 0;
        w = Math.min(w, LIGHT_SIGNAL_WEEKLY_CAP - spent);
        if (w <= 0) return;
        c.lightSpent.set(week, spent + w);
      }
      c.vitality = applyImpulse(c.vitality, w);
      c.lastInteractionAt = e.at;
      // A real interaction ends a snooze early.
      c.snoozedUntil = null;
      return;
    }
    case 'tier_set':
      c.ring = e.ring;
      return;
    case 'snooze':
      c.snoozedUntil = e.at + (e.days ?? MULCH_DAYS) * DAY_MS;
      return;
    case 'prune':
      c.ring = 'dormant';
      c.snoozedUntil = null;
      return;
    case 'evergreen_set':
      c.evergreen = e.evergreen;
      return;
    case 'half_life_set':
      c.customHalfLifeDays = e.days;
      return;
  }
}

export interface FoldOptions {
  /** Evaluate every contact's vitality as of this time. Defaults to the last event. */
  now?: number;
  /** State to continue from (incremental fold). It is not mutated. */
  from?: Map<string, ContactVitality>;
}

function clone(c: ContactVitality): ContactVitality {
  return { ...c, lightSpent: new Map(c.lightSpent) };
}

/**
 * Fold an event log into per-contact vitality. Events are sorted by tid
 * (ties by input order), so two devices folding the same set agree exactly.
 */
export function fold(events: readonly DunbarEvent[], opts: FoldOptions = {}): Map<string, ContactVitality> {
  const state = new Map<string, ContactVitality>();
  if (opts.from) for (const [k, v] of opts.from) state.set(k, clone(v));

  const sorted = events.slice().sort((a, b) => (a.tid < b.tid ? -1 : a.tid > b.tid ? 1 : 0));
  let last = 0;
  for (const e of sorted) {
    let c = state.get(e.contactId);
    if (!c) {
      c = newContact(e.contactId, e.at);
      state.set(e.contactId, c);
    }
    apply(c, e);
    if (e.at > last) last = e.at;
  }

  const now = opts.now ?? last;
  for (const c of state.values()) advance(c, now);
  return state;
}
