import { describe, expect, it } from 'vitest';
import { applyImpulse, fold, vitalityAt } from './engine';
import { DAY_MS, type DunbarEvent } from './model';

const T0 = Date.UTC(2027, 0, 4); // a Monday
let seq = 0;
const tid = () => `3l${String(seq++).padStart(11, '0')}`;
const ev = <E extends Omit<DunbarEvent, 'tid' | 'contactId'>>(e: E, contactId = 'c1') =>
  ({ tid: tid(), contactId, ...e }) as DunbarEvent;

describe('decay', () => {
  it('halves vitality after one ring half-life', () => {
    const s = fold([ev({ type: 'tier_set', ring: 'support', at: T0 })], { now: T0 + 7 * DAY_MS });
    expect(s.get('c1')!.vitality).toBeCloseTo(25, 6);
  });

  it('freezes for dormant and evergreen contacts', () => {
    const now = T0 + 365 * DAY_MS;
    const s = fold(
      [
        ev({ type: 'prune', at: T0 }, 'a'),
        ev({ type: 'evergreen_set', evergreen: true, at: T0 }, 'b'),
      ],
      { now },
    );
    expect(s.get('a')!.vitality).toBe(50);
    expect(s.get('b')!.vitality).toBe(50);
  });

  it('honours a custom half-life', () => {
    const s = fold([ev({ type: 'half_life_set', days: 365, at: T0 })], { now: T0 + 365 * DAY_MS });
    expect(s.get('c1')!.vitality).toBeCloseTo(25, 6);
  });

  it('pauses decay while mulched', () => {
    const s = fold(
      [ev({ type: 'tier_set', ring: 'support', at: T0 }), ev({ type: 'snooze', at: T0 })],
      { now: T0 + 30 * DAY_MS + 7 * DAY_MS },
    );
    // 30 snoozed days don't count; the 7 after do.
    expect(s.get('c1')!.vitality).toBeCloseTo(25, 6);
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
    const prune = ev({ type: 'prune', at: T0 - 1 });
    const likes = Array.from({ length: 10 }, (_, i) =>
      ev({ type: 'interaction', kind: 'atproto_like', at: T0 + i * 1000 }),
    );
    const capped = fold([prune, ...likes]);
    // Dormant: no decay, so only impulses move it. 3 likes × 2 = 6 weight.
    let expected = 50;
    for (let i = 0; i < 3; i++) expected = applyImpulse(expected, 2);
    expect(capped.get('c1')!.vitality).toBeCloseTo(expected, 9);
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
    const a = fold(events, { now }).get('c1')!;
    const b = fold(events.slice().reverse(), { now }).get('c1')!;
    expect(b.vitality).toBe(a.vitality);
  });

  it('continues incrementally from a snapshot', () => {
    const first = [ev({ type: 'interaction', kind: 'call_long', at: T0 })];
    const second = [ev({ type: 'interaction', kind: 'dm_thread', at: T0 + 5 * DAY_MS })];
    const now = T0 + 10 * DAY_MS;
    const whole = fold([...first, ...second], { now }).get('c1')!;
    const snap = fold(first);
    const inc = fold(second, { from: snap, now }).get('c1')!;
    expect(inc.vitality).toBeCloseTo(whole.vitality, 9);
    expect(snap.get('c1')!.asOf).toBe(T0); // snapshot untouched
  });

  it('folds 10,000 events in under 50ms', () => {
    const events: DunbarEvent[] = [];
    for (let i = 0; i < 10_000; i++) {
      events.push(ev({ type: 'interaction', kind: 'dm_thread', at: T0 + i * 60_000 }, `c${i % 150}`));
    }
    fold(events); // warm-up
    const start = Date.now();
    fold(events, { now: T0 + 30 * DAY_MS });
    expect(Date.now() - start).toBeLessThan(50);
    expect(vitalityAt(fold(events).get('c0')!, T0)).toBeGreaterThan(0);
  });
});
