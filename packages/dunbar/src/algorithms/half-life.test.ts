import { describe, expect, it } from 'vitest';
import { DAY_MS, type DunbarEvent } from '../model';
import { ev, T0 } from '../test-helpers';
import { applyImpulse, halfLifeAlgorithm } from './half-life';

const algo = halfLifeAlgorithm.create(halfLifeAlgorithm.params.parse({}));
const score = (events: DunbarEvent[], now: number, id = 'c1') => algo.fold(events, { now }).scores.get(id)!.score;

describe('half-life decay', () => {
  it('halves after one ring half-life', () => {
    expect(score([ev({ type: 'tier_set', ring: 'support', at: T0 })], T0 + 7 * DAY_MS)).toBeCloseTo(25, 6);
  });

  it('freezes for dormant and evergreen contacts', () => {
    const events = [ev({ type: 'prune', at: T0 }, 'a'), ev({ type: 'evergreen_set', evergreen: true, at: T0 }, 'b')];
    const now = T0 + 365 * DAY_MS;
    expect(score(events, now, 'a')).toBe(50);
    expect(score(events, now, 'b')).toBe(50);
  });

  it('honours a custom half-life', () => {
    expect(score([ev({ type: 'half_life_set', days: 365, at: T0 })], T0 + 365 * DAY_MS)).toBeCloseTo(25, 6);
  });

  it('pauses decay while mulched', () => {
    const events = [ev({ type: 'tier_set', ring: 'support', at: T0 }), ev({ type: 'snooze', at: T0 })];
    expect(score(events, T0 + 37 * DAY_MS)).toBeCloseTo(25, 6);
  });

  it('takes its ring half-lives from params', () => {
    const fast = halfLifeAlgorithm.create(halfLifeAlgorithm.params.parse({ halfLifeDays: { support: 1 } }));
    const s = fast.fold([ev({ type: 'tier_set', ring: 'support', at: T0 })], { now: T0 + DAY_MS }).scores.get('c1')!;
    expect(s.score).toBeCloseTo(25, 6);
    expect(s.drifting).toBe(false); // 25 is not below 25
  });
});

describe('impulse', () => {
  it('stays bounded with diminishing returns', () => {
    expect(applyImpulse(0, 45)).toBe(45);
    expect(applyImpulse(50, 30)).toBe(65);
    let v = 0;
    for (let i = 0; i < 100; i++) v = applyImpulse(v, 45);
    expect(v).toBeLessThanOrEqual(100);
  });

  it('caps likes/reposts at +6 a week', () => {
    const events = [ev({ type: 'prune', at: T0 - 1 })];
    for (let i = 0; i < 10; i++) events.push(ev({ type: 'interaction', kind: 'atproto_like', at: T0 + i * 1000 }));
    let expected = 50;
    for (let i = 0; i < 3; i++) expected = applyImpulse(expected, 2);
    expect(score(events, T0 + 20_000)).toBeCloseTo(expected, 9);
  });
});

describe('fold', () => {
  it('is order-independent: events sort by tid', () => {
    const events = [
      ev({ type: 'tier_set', ring: 'sympathy', at: T0 }),
      ev({ type: 'interaction', kind: 'in_person', at: T0 + 3 * DAY_MS }),
      ev({ type: 'interaction', kind: 'dm_thread', at: T0 + 9 * DAY_MS }),
    ];
    const now = T0 + 20 * DAY_MS;
    expect(score(events.slice().reverse(), now)).toBe(score(events, now));
  });

  it('continues incrementally from a snapshot', () => {
    const first = [ev({ type: 'interaction', kind: 'call_long', at: T0 })];
    const second = [ev({ type: 'interaction', kind: 'dm_thread', at: T0 + 5 * DAY_MS })];
    const now = T0 + 10 * DAY_MS;
    const { snapshot } = algo.fold(first, { now: T0 });
    const inc = algo.fold(second, { now, from: snapshot }).scores.get('c1')!.score;
    expect(inc).toBeCloseTo(score([...first, ...second], now), 9);
    expect(snapshot.get('c1')!.asOf).toBe(T0); // the snapshot was not mutated
  });

  it('folds 10,000 events in under 50ms', () => {
    const events: DunbarEvent[] = [];
    for (let i = 0; i < 10_000; i++) events.push(ev({ type: 'interaction', kind: 'dm_thread', at: T0 + i * 60_000 }, `c${i % 150}`));
    algo.fold(events, { now: T0 }); // warm-up
    const start = Date.now();
    algo.fold(events, { now: T0 + 30 * DAY_MS });
    expect(Date.now() - start).toBeLessThan(50);
  });
});
