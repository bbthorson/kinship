/**
 * Grant Ledger: reference-counted revocation (PRD Journey C).
 *
 * A bundle is a named preset of space refs. Several bundles can share a space
 * (Rugby and Sci-Fi both include Personal Cell), so revoking one bundle may
 * only revoke the spaces no *remaining* bundle for that recipient still covers.
 *
 * The ledger lives encrypted in the vault (`app.kinship.vault.grant`), keyed by
 * a hash of the recipient's DID. These functions are pure: they take the
 * decrypted records and return new ones plus the work to do on the PDS.
 */

export interface Bundle {
  id: string;
  spaceRefs: readonly string[];
}

export interface GrantEntry {
  targetDidHash: string;
  activeBundles: readonly string[];
}

export interface RevokeResult {
  entry: GrantEntry;
  /** Spaces the recipient must lose access to. */
  revokeSpaceRefs: string[];
  /** Spaces the recipient keeps because another active bundle still covers them. */
  retainedSpaceRefs: string[];
}

function refsFor(bundleIds: Iterable<string>, bundles: ReadonlyMap<string, Bundle>): Set<string> {
  const out = new Set<string>();
  for (const id of bundleIds) for (const ref of bundles.get(id)?.spaceRefs ?? []) out.add(ref);
  return out;
}

export function grantBundle(
  entry: GrantEntry,
  bundleId: string,
  bundles: ReadonlyMap<string, Bundle>,
): { entry: GrantEntry; grantSpaceRefs: string[] } {
  if (!bundles.has(bundleId)) throw new Error(`unknown bundle ${bundleId}`);
  if (entry.activeBundles.includes(bundleId)) return { entry, grantSpaceRefs: [] };
  const had = refsFor(entry.activeBundles, bundles);
  const grantSpaceRefs = [...refsFor([bundleId], bundles)].filter((r) => !had.has(r));
  return { entry: { ...entry, activeBundles: [...entry.activeBundles, bundleId] }, grantSpaceRefs };
}

export function revokeBundle(
  entry: GrantEntry,
  bundleId: string,
  bundles: ReadonlyMap<string, Bundle>,
): RevokeResult {
  const remaining = entry.activeBundles.filter((b) => b !== bundleId);
  const kept = refsFor(remaining, bundles);
  const revoked = [...refsFor([bundleId], bundles)];
  return {
    entry: { ...entry, activeBundles: remaining },
    revokeSpaceRefs: revoked.filter((r) => !kept.has(r)),
    retainedSpaceRefs: revoked.filter((r) => kept.has(r)),
  };
}

/**
 * When a bundle's definition changes (a space added or removed), every holder's
 * effective access changes too. Returns the per-recipient diff.
 */
export function rebundle(
  entries: readonly GrantEntry[],
  bundles: ReadonlyMap<string, Bundle>,
  next: Bundle,
): { targetDidHash: string; grant: string[]; revoke: string[] }[] {
  const after = new Map(bundles).set(next.id, next);
  return entries
    .filter((e) => e.activeBundles.includes(next.id))
    .map((e) => {
      const before = refsFor(e.activeBundles, bundles);
      const now = refsFor(e.activeBundles, after);
      return {
        targetDidHash: e.targetDidHash,
        grant: [...now].filter((r) => !before.has(r)),
        revoke: [...before].filter((r) => !now.has(r)),
      };
    })
    .filter((d) => d.grant.length > 0 || d.revoke.length > 0);
}
