import { describe, expect, it } from 'vitest';
import { fold } from './engine';
import { DAY_MS, type DunbarEvent, type Ring } from './model';
import { checkPromotion, gardenWalk } from './rings';

const T0 = Date.UTC(2027, 0, 4);
let seq = 0;
const tierSet = (contactId: string, ring: Ring): DunbarEvent => ({
  tid: `3l${String(seq++).padStart(11, '0')}`, contactId, at: T0, type: 'tier_set', ring,
});

describe('checkPromotion', () => {
  const full = fold([...Array.from({ length: 5 }, (_, i) => tierSet(`s${i}`, 'support')), tierSet('x', 'sympathy')]);

  it('demands a repot when the ring is full', () => {
    expect(checkPromotion(full, 'x', 'support')).toEqual({ ok: false, reason: 'ring_full_needs_repot' });
  });

  it('repots the named member one ring outward', () => {
    expect(checkPromotion(full, 'x', 'support', 's0')).toEqual({ ok: true, repot: { contactId: 's0', to: 'sympathy' } });
  });

  it('rejects a repot target outside the ring', () => {
    expect(checkPromotion(full, 'x', 'support', 'x')).toEqual({ ok: false, reason: 'repot_not_in_ring' });
  });
});

describe('gardenWalk', () => {
  it('returns drifting contacts, inner rings first, skipping evergreen and dormant', () => {
    const s = fold([
      tierSet('inner', 'support'),
      tierSet('outer', 'affinity'),
      tierSet('gone', 'dormant'),
      { ...tierSet('ever', 'support'), type: 'evergreen_set', evergreen: true } as DunbarEvent,
      tierSet('ever', 'support'),
    ]);
    const now = T0 + 200 * DAY_MS;
    expect(gardenWalk(s, now).map((c) => c.contactId)).toEqual(['inner', 'outer']);
  });
});
