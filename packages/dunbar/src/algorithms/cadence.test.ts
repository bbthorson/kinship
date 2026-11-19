import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../model';
import { ev, T0 } from '../test-helpers';
import { cadenceAlgorithm } from './cadence';

const algo = cadenceAlgorithm.create(cadenceAlgorithm.params.parse({}));

describe('cadence', () => {
  it('drifts once the ring interval has passed without contact', () => {
    const events = [ev({ type: 'tier_set', ring: 'support', at: T0 }), ev({ type: 'interaction', kind: 'dm_thread', at: T0 })];
    expect(algo.fold(events, { now: T0 + 6 * DAY_MS }).scores.get('c1')!.drifting).toBe(false);
    const late = algo.fold(events, { now: T0 + 8 * DAY_MS }).scores.get('c1')!;
    expect(late.drifting).toBe(true);
    expect(late.score).toBeCloseTo(100 * (1 - 8 / 14), 6);
  });

  it('ignores likes unless asked to count them', () => {
    const events = [
      ev({ type: 'tier_set', ring: 'support', at: T0 }),
      ev({ type: 'interaction', kind: 'dm_thread', at: T0 }),
      ev({ type: 'interaction', kind: 'atproto_like', at: T0 + 7 * DAY_MS }),
    ];
    const now = T0 + 8 * DAY_MS;
    expect(algo.fold(events, { now }).scores.get('c1')!.drifting).toBe(true);
    const counting = cadenceAlgorithm.create(cadenceAlgorithm.params.parse({ countLightSignals: true }));
    expect(counting.fold(events, { now }).scores.get('c1')!.drifting).toBe(false);
  });

  it('does not count snoozed time', () => {
    const events = [
      ev({ type: 'tier_set', ring: 'support', at: T0 }),
      ev({ type: 'interaction', kind: 'dm_thread', at: T0 }),
      ev({ type: 'snooze', at: T0 + DAY_MS }),
    ];
    expect(algo.fold(events, { now: T0 + 35 * DAY_MS }).scores.get('c1')!.drifting).toBe(false);
  });
});
