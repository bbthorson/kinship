import { z } from 'zod';
import type { AlgorithmDefinition, Score, VitalityAlgorithm } from '../algorithm';
import { DAY_MS, type InteractionKind, sortedByTid } from '../model';
import { foldRelationships } from '../relationships';

/**
 * A second, deliberately simpler algorithm: no weights, just "have you been in
 * touch as often as this ring expects?". Any meaningful interaction resets the
 * clock; likes/reposts are ignored unless `countLightSignals`.
 *
 *   score = 100 · clamp(1 − elapsed / (2 · interval))
 *   drifting when elapsed > interval · driftAfter
 *
 * `elapsed` excludes snoozed time. The interval is the contact's custom
 * half-life hint, else the ring's. It exists as much to keep the algorithm
 * interface honest as for users who prefer a rhythm to a score.
 */

export const CadenceParams = z.object({
  intervalDays: z
    .object({
      support: z.number().positive().default(7),
      sympathy: z.number().positive().default(30),
      affinity: z.number().positive().default(90),
      clan: z.number().positive().default(365),
    })
    .prefault({}),
  driftAfter: z.number().positive().default(1),
  countLightSignals: z.boolean().default(false),
});
export type CadenceParams = z.infer<typeof CadenceParams>;

const LIGHT: ReadonlySet<InteractionKind> = new Set(['atproto_like']);

function create(p: CadenceParams): VitalityAlgorithm<null> {
  return {
    id: cadenceAlgorithm.id,
    version: cadenceAlgorithm.version,
    // Cheap enough to refold from scratch, so no incremental snapshot.
    fold(events, { now }) {
      const counted = sortedByTid(events).filter((e) => !(e.type === 'interaction' && !p.countLightSignals && LIGHT.has(e.kind)));
      const rels = foldRelationships(counted);
      const scores = new Map<string, Score>();
      for (const r of rels.values()) {
        if (r.ring === 'dormant' || r.evergreen) {
          scores.set(r.contactId, { score: 100, drifting: false });
          continue;
        }
        const interval = (r.customHalfLifeDays ?? p.intervalDays[r.ring]) * DAY_MS;
        const since = r.lastInteractionAt ?? r.firstSeenAt;
        let elapsed = Math.max(0, now - since);
        if (r.snoozedUntil !== null) elapsed = Math.max(0, now - Math.max(since, r.snoozedUntil));
        const score = 100 * Math.min(1, Math.max(0, 1 - elapsed / (2 * interval)));
        scores.set(r.contactId, { score, drifting: elapsed > interval * p.driftAfter });
      }
      return { scores, snapshot: null };
    },
  };
}

export const cadenceAlgorithm: AlgorithmDefinition<CadenceParams, null> = {
  id: 'app.kinship.algorithm.cadence',
  version: 1,
  label: 'Cadence',
  description: 'No scores to game: a contact drifts when you have gone longer than their ring expects without talking.',
  params: CadenceParams,
  create,
};
