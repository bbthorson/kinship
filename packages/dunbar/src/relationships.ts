import { DAY_MS, DEFAULT_MULCH_DAYS, type DunbarEvent, type Ring, sortedByTid } from './model';

/** The user's own decisions about a contact, independent of any scoring algorithm. */
export interface Relationship {
  contactId: string;
  ring: Ring;
  evergreen: boolean;
  /** From `half_life_set`: the user's preferred rhythm for this contact, in days. */
  customHalfLifeDays: number | null;
  snoozedUntil: number | null;
  lastInteractionAt: number | null;
  firstSeenAt: number;
}

/** New contacts land in the outermost active ring. */
export const DEFAULT_RING: Ring = 'clan';

export function foldRelationships(events: readonly DunbarEvent[]): Map<string, Relationship> {
  const out = new Map<string, Relationship>();
  for (const e of sortedByTid(events)) {
    let r = out.get(e.contactId);
    if (!r) {
      r = {
        contactId: e.contactId,
        ring: DEFAULT_RING,
        evergreen: false,
        customHalfLifeDays: null,
        snoozedUntil: null,
        lastInteractionAt: null,
        firstSeenAt: e.at,
      };
      out.set(e.contactId, r);
    }
    switch (e.type) {
      case 'interaction':
        r.lastInteractionAt = Math.max(r.lastInteractionAt ?? e.at, e.at);
        r.snoozedUntil = null; // a real interaction ends a snooze early
        break;
      case 'tier_set':
        r.ring = e.ring;
        break;
      case 'snooze':
        r.snoozedUntil = e.at + (e.days ?? DEFAULT_MULCH_DAYS) * DAY_MS;
        break;
      case 'prune':
        r.ring = 'dormant';
        r.snoozedUntil = null;
        break;
      case 'evergreen_set':
        r.evergreen = e.evergreen;
        break;
      case 'half_life_set':
        r.customHalfLifeDays = e.days;
        break;
    }
  }
  return out;
}
