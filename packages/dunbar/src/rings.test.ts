import { describe, expect, it } from 'vitest';
import { cadenceAlgorithm } from './algorithms/cadence';
import { halfLifeAlgorithm } from './algorithms/half-life';
import { DAY_MS } from './model';
import { foldRelationships } from './relationships';
import { checkPromotion, gardenWalk } from './rings';
import { ev, T0 } from './test-helpers';

describe('checkPromotion', () => {
  const rels = foldRelationships([
    ...Array.from({ length: 5 }, (_, i) => ev({ type: 'tier_set', ring: 'support', at: T0 }, `s${i}`)),
    ev({ type: 'tier_set', ring: 'sympathy', at: T0 }, 'x'),
  ]);

  it('demands a repot when the ring is full', () => {
    expect(checkPromotion(rels, 'x', 'support')).toEqual({ ok: false, reason: 'ring_full_needs_repot' });
  });

  it('repots the named member one ring outward', () => {
    expect(checkPromotion(rels, 'x', 'support', 's0')).toEqual({ ok: true, repot: { contactId: 's0', to: 'sympathy' } });
  });

  it('rejects a repot target outside the ring', () => {
    expect(checkPromotion(rels, 'x', 'support', 'x')).toEqual({ ok: false, reason: 'repot_not_in_ring' });
  });
});

describe('gardenWalk', () => {
  const events = [
    ev({ type: 'tier_set', ring: 'support', at: T0 }, 'inner'),
    ev({ type: 'tier_set', ring: 'affinity', at: T0 }, 'outer'),
    ev({ type: 'tier_set', ring: 'dormant', at: T0 }, 'gone'),
    ev({ type: 'tier_set', ring: 'support', at: T0 }, 'ever'),
    ev({ type: 'evergreen_set', evergreen: true, at: T0 }, 'ever'),
  ];
  const rels = foldRelationships(events);
  const now = T0 + 400 * DAY_MS;

  it.each([halfLifeAlgorithm, cadenceAlgorithm])('works the same with any algorithm: $label', (def) => {
    const algo = def.create(def.params.parse({}) as never);
    const { scores } = algo.fold(events, { now });
    expect(gardenWalk(rels, scores, now).map((i) => i.relationship.contactId)).toEqual(['inner', 'outer']);
  });

  it('never surfaces an ineligible contact, even if an algorithm says it drifts', () => {
    const scores = new Map(['inner', 'outer', 'gone', 'ever'].map((id) => [id, { score: 0, drifting: true }]));
    expect(gardenWalk(rels, scores, now).map((i) => i.relationship.contactId)).toEqual(['inner', 'outer']);
  });
});
