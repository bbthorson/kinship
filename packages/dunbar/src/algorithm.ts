import type { z } from 'zod';
import type { DunbarEvent } from './model';

/**
 * Replaceable scoring algorithms — the Dunbar equivalent of Bluesky's custom
 * feeds. The user picks one (and its parameters); the garden walk asks it who
 * is drifting. Rings, caps and triage stay the same whichever is chosen.
 *
 * Algorithms run **on device**: the event log is end-to-end encrypted, and a
 * remote algorithm (a feed-generator-style service) would have to be handed
 * the decrypted log. See docs/decisions/0001-replaceable-scoring.md.
 */

export interface Score {
  /** 0–100, higher is healthier. Comparable within one algorithm only. */
  score: number;
  /** Whether the garden walk should surface this contact. */
  drifting: boolean;
}

export interface FoldContext<Snapshot> {
  /** Evaluate every score as of this time. */
  now: number;
  /** Continue from an earlier fold's snapshot instead of from an empty log. */
  from?: Snapshot;
}

export interface FoldResult<Snapshot> {
  scores: Map<string, Score>;
  /** Opaque state to pass back as `from` with only the newer events. */
  snapshot: Snapshot;
}

/** A configured, runnable algorithm. Must be pure and deterministic. */
export interface VitalityAlgorithm<Snapshot = unknown> {
  readonly id: string;
  readonly version: number;
  fold(events: readonly DunbarEvent[], ctx: FoldContext<Snapshot>): FoldResult<Snapshot>;
}

/** What a catalogue lists: identity, parameter schema, and a factory. */
export interface AlgorithmDefinition<Params = unknown, Snapshot = unknown> {
  /** Reverse-DNS, like an NSID, so third-party algorithms can't collide. */
  readonly id: string;
  /** Bump when the same params would produce different scores. */
  readonly version: number;
  readonly label: string;
  readonly description: string;
  /** Every field defaulted, so `{}` is a valid configuration. */
  readonly params: z.ZodType<Params, unknown>;
  create(params: Params): VitalityAlgorithm<Snapshot>;
}

/** The user's choice, stored sealed in the vault and synced across devices. */
export interface AlgorithmPreference {
  algorithmId: string;
  params?: unknown;
}

export type InstantiateResult =
  | { ok: true; algorithm: VitalityAlgorithm; definition: AlgorithmDefinition }
  | { ok: false; reason: 'invalid_params'; issues: string; fallback: VitalityAlgorithm };

export class AlgorithmCatalog {
  private defs = new Map<string, AlgorithmDefinition>();

  constructor(
    // `create` and `fold` are methods, so TypeScript checks them bivariantly and
    // any concrete definition is assignable here without a cast.
    definitions: readonly AlgorithmDefinition[],
    private readonly defaultId: string,
  ) {
    for (const d of definitions) {
      if (this.defs.has(d.id)) throw new Error(`duplicate algorithm id ${d.id}`);
      this.defs.set(d.id, d);
    }
    if (!this.defs.has(defaultId)) throw new Error(`default algorithm ${defaultId} is not in the catalogue`);
  }

  list(): AlgorithmDefinition[] {
    return [...this.defs.values()];
  }

  get(id: string): AlgorithmDefinition | undefined {
    return this.defs.get(id);
  }

  /**
   * Build the user's chosen algorithm. An id this build doesn't know (chosen
   * on a newer app version on another device) falls back to the default
   * silently; bad params fall back too, but report why.
   */
  instantiate(pref: AlgorithmPreference | null | undefined): InstantiateResult {
    const fallbackDef = this.defs.get(this.defaultId);
    if (!fallbackDef) throw new Error('unreachable: default checked in constructor');
    const fallback = () => fallbackDef.create(fallbackDef.params.parse({}));
    const def = pref ? this.defs.get(pref.algorithmId) : undefined;
    if (!def) return { ok: true, algorithm: fallback(), definition: fallbackDef };
    const parsed = def.params.safeParse(pref?.params ?? {});
    if (!parsed.success) return { ok: false, reason: 'invalid_params', issues: parsed.error.message, fallback: fallback() };
    return { ok: true, algorithm: def.create(parsed.data), definition: def };
  }
}
