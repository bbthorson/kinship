/**
 * Dunbar rings, interaction weights and the event shape the daemon folds.
 *
 * The event log is `app.kinship.dunbar.event` (key: tid) in the vault space.
 * Events are decrypted on device and handed to `fold()` in any order; the fold
 * sorts by tid itself, because tid order is the only order that is the same on
 * every device.
 */

export const RINGS = ['support', 'sympathy', 'affinity', 'clan', 'dormant'] as const;
export type Ring = (typeof RINGS)[number];

export const RING_CONFIG: Record<Ring, { cap: number; halfLifeDays: number | null }> = {
  support: { cap: 5, halfLifeDays: 7 },
  sympathy: { cap: 15, halfLifeDays: 21 },
  affinity: { cap: 50, halfLifeDays: 60 },
  clan: { cap: 150, halfLifeDays: 180 },
  // null half-life = decay frozen. Dormant contacts never enter the garden walk.
  dormant: { cap: Number.POSITIVE_INFINITY, halfLifeDays: null },
};

export const INTERACTION_WEIGHTS = {
  in_person: 45,
  call_long: 30, // call over 10 minutes
  dm_thread: 15,
  atproto_reply: 8,
  atproto_like: 2, // also reposts
} as const;
export type InteractionKind = keyof typeof INTERACTION_WEIGHTS;

/** Light signals (likes/reposts) contribute at most this much weight per week. */
export const LIGHT_SIGNAL_WEEKLY_CAP = 6;
export const LIGHT_SIGNALS: ReadonlySet<InteractionKind> = new Set(['atproto_like']);

export const DRIFT_THRESHOLD = 25;
export const MULCH_DAYS = 30;
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
  | (EventBase & { type: 'half_life_set'; days: number | null });

export interface ContactVitality {
  contactId: string;
  ring: Ring;
  /** Vitality as of `asOf`, in [0, 100]. */
  vitality: number;
  /** The time `vitality` is valid at. */
  asOf: number;
  lastInteractionAt: number | null;
  snoozedUntil: number | null;
  evergreen: boolean;
  customHalfLifeDays: number | null;
  /** Light-signal weight spent per week bucket (floor(at / WEEK_MS)). */
  lightSpent: Map<number, number>;
}
