import { type ContactVitality, DRIFT_THRESHOLD, RINGS, RING_CONFIG, type Ring } from './model';
import { vitalityAt } from './engine';

export function ringCounts(state: Iterable<ContactVitality>): Record<Ring, number> {
  const counts = Object.fromEntries(RINGS.map((r) => [r, 0])) as Record<Ring, number>;
  for (const c of state) counts[c.ring]++;
  return counts;
}

/** The ring one step further out. `dormant` stays `dormant`. */
export function outerRing(r: Ring): Ring {
  const i = RINGS.indexOf(r);
  return RINGS[Math.min(i + 1, RINGS.length - 1)] ?? 'dormant';
}

export type PromotionCheck =
  | { ok: true; repot: null }
  | { ok: true; repot: { contactId: string; to: Ring } }
  | { ok: false; reason: 'ring_full_needs_repot' | 'repot_not_in_ring' | 'unknown_contact' };

/**
 * One-in, one-out: moving a contact into a full ring requires naming a current
 * member to repot one ring outward. The caller turns an ok result into two
 * `tier_set` events (repot first, then the promotion).
 */
export function checkPromotion(
  state: Map<string, ContactVitality>,
  contactId: string,
  to: Ring,
  repotContactId?: string,
): PromotionCheck {
  const c = state.get(contactId);
  if (!c) return { ok: false, reason: 'unknown_contact' };
  if (c.ring === to) return { ok: true, repot: null };
  const counts = ringCounts(state.values());
  if (counts[to] < RING_CONFIG[to].cap) return { ok: true, repot: null };
  if (!repotContactId) return { ok: false, reason: 'ring_full_needs_repot' };
  const victim = state.get(repotContactId);
  if (!victim || victim.ring !== to) return { ok: false, reason: 'repot_not_in_ring' };
  return { ok: true, repot: { contactId: repotContactId, to: outerRing(to) } };
}

/**
 * The weekly garden walk: contacts under the drift threshold, excluding
 * dormant, evergreen and snoozed ones, inner rings first, then the most drifted.
 */
export function gardenWalk(
  state: Map<string, ContactVitality>,
  now: number,
  opts: { max?: number } = {},
): ContactVitality[] {
  const max = opts.max ?? 5;
  const drifting = [...state.values()]
    .filter((c) => c.ring !== 'dormant' && !c.evergreen)
    .filter((c) => c.snoozedUntil === null || c.snoozedUntil <= now)
    .map((c) => ({ c, v: vitalityAt(c, now) }))
    .filter(({ v }) => v < DRIFT_THRESHOLD)
    .sort((a, b) => RINGS.indexOf(a.c.ring) - RINGS.indexOf(b.c.ring) || a.v - b.v);
  return drifting.slice(0, max).map(({ c }) => c);
}
