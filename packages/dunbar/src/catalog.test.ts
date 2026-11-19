import { describe, expect, it } from 'vitest';
import { cadenceAlgorithm } from './algorithms/cadence';
import { halfLifeAlgorithm } from './algorithms/half-life';
import { builtInCatalog } from './catalog';

describe('builtInCatalog', () => {
  it('lists every shipped algorithm', () => {
    expect(builtInCatalog.list().map((d) => d.id)).toEqual([halfLifeAlgorithm.id, cadenceAlgorithm.id]);
  });

  it('builds the chosen algorithm with its params', () => {
    const r = builtInCatalog.instantiate({ algorithmId: cadenceAlgorithm.id, params: { driftAfter: 2 } });
    expect(r.ok && r.algorithm.id).toBe(cadenceAlgorithm.id);
  });

  it('falls back to the default for an id this build does not know', () => {
    const r = builtInCatalog.instantiate({ algorithmId: 'com.example.future' });
    expect(r.ok && r.algorithm.id).toBe(halfLifeAlgorithm.id);
  });

  it('reports bad params and still hands back a runnable default', () => {
    const r = builtInCatalog.instantiate({ algorithmId: cadenceAlgorithm.id, params: { driftAfter: -1 } });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.fallback.id).toBe(halfLifeAlgorithm.id);
  });
});
