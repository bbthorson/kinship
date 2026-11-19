/**
 * The Dunbar event log and the structure every scoring algorithm shares.
 *
 * Two things are kept apart on purpose:
 * - **Relationship state** (which ring, evergreen, snoozed, pruned) is the
 *   user's own decisions. It is folded the same way whatever algorithm runs,
 *   so switching algorithms never moves anyone between rings.
 * - **Scores** (how healthy a relationship looks) are an algorithm's opinion,
 *   and the algorithm is replaceable (`algorithm.ts`).
 *
 * The log is `app.kinship.dunbar.event` (key: tid) in the vault space, sealed
 * on device. Events are folded in tid order, the only order every device agrees on.
 */

export const RINGS = ['support', 'sympathy', 'affinity', 'clan', 'dormant'] as const;
export type Ring = (typeof RINGS)[number];

/** Hard slot caps (one-in, one-out). Structural, so not an algorithm parameter. */
export const RING_CAPS: Record<Ring, number> = {
  support: 5,
  sympathy: 15,
  affinity: 50,
  clan: 150,
  dormant: Number.POSITIVE_INFINITY,
};

export const INTERACTION_KINDS = ['in_person', 'call_long', 'dm_thread', 'atproto_reply', 'atproto_like'] as const;
/** `call_long` is a call over 10 minutes; `atproto_like` also covers reposts. */
export type InteractionKind = (typeof INTERACTION_KINDS)[number];

export const DEFAULT_MULCH_DAYS = 30;
export const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;

interface EventBase {
  /** atproto TID — the record key. Sorts lexicographically in time order. */
  tid: string;
  contactId: string;
  /** Wall-clock ms of the event itself (an interaction can be logged late). */
  at: number;
}

export type DunbarEvent =
  | (EventBase & { type: 'interaction'; kind: InteractionKind })
  | (EventBase & { type: 'tier_set'; ring: Ring })
  | (EventBase & { type: 'snooze'; days?: number })
  | (EventBase & { type: 'prune' })
  | (EventBase & { type: 'evergreen_set'; evergreen: boolean })
  /** The user's "how often should I see them" hint. Each algorithm reads it its own way. */
  | (EventBase & { type: 'half_life_set'; days: number | null });

export function byTid(a: DunbarEvent, b: DunbarEvent): number {
  return a.tid < b.tid ? -1 : a.tid > b.tid ? 1 : 0;
}

export function sortedByTid(events: readonly DunbarEvent[]): DunbarEvent[] {
  return events.slice().sort(byTid);
}
