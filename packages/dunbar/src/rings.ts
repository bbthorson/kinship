import type { Score } from './algorithm';
import { RING_CAPS, RINGS, type Ring } from './model';
import type { Relationship } from './relationships';

export function ringCounts(rels: Iterable<Relationship>): Record<Ring, number> {
  const counts: Record<Ring, number> = { support: 0, sympathy: 0, affinity: 0, clan: 0, dormant: 0 };
  for (const r of rels) counts[r.ring]++;
  return counts;
}

/** The ring one step further out. `dormant` stays `dormant`. */
export function outerRing(r: Ring): Ring {
  return RINGS[Math.min(RINGS.indexOf(r) + 1, RINGS.length - 1)] ?? 'dormant';
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
  rels: Map<string, Relationship>,
  contactId: string,
  to: Ring,
  repotContactId?: string,
): PromotionCheck {
  const c = rels.get(contactId);
  if (!c) return { ok: false, reason: 'unknown_contact' };
  if (c.ring === to) return { ok: true, repot: null };
  if (ringCounts(rels.values())[to] < RING_CAPS[to]) return { ok: true, repot: null };
  if (!repotContactId) return { ok: false, reason: 'ring_full_needs_repot' };
  const victim = rels.get(repotContactId);
  if (!victim || victim.ring !== to) return { ok: false, reason: 'repot_not_in_ring' };
  return { ok: true, repot: { contactId: repotContactId, to: outerRing(to) } };
}

export interface WalkItem {
  relationship: Relationship;
  score: Score;
}

/**
 * The weekly garden walk. Which contacts are drifting is the algorithm's call;
 * who is eligible is the user's: dormant, evergreen and snoozed contacts never
 * appear, whatever an algorithm says. Inner rings first, then lowest score.
 */
export function gardenWalk(
  rels: Map<string, Relationship>,
  scores: Map<string, Score>,
  now: number,
  opts: { max?: number } = {},
): WalkItem[] {
  const items: WalkItem[] = [];
  for (const r of rels.values()) {
    if (r.ring === 'dormant' || r.evergreen) continue;
    if (r.snoozedUntil !== null && r.snoozedUntil > now) continue;
    const score = scores.get(r.contactId);
    if (score?.drifting) items.push({ relationship: r, score });
  }
  items.sort((a, b) => RINGS.indexOf(a.relationship.ring) - RINGS.indexOf(b.relationship.ring) || a.score.score - b.score.score);
  return items.slice(0, opts.max ?? 5);
}
