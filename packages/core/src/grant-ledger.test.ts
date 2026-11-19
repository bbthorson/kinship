import { describe, expect, it } from 'vitest';
import { type Bundle, grantBundle, rebundle, revokeBundle } from './grant-ledger';

const bundles = new Map<string, Bundle>([
  ['rugby', { id: 'rugby', spaceRefs: ['cell', 'ctx-rugby'] }],
  ['scifi', { id: 'scifi', spaceRefs: ['cell', 'ctx-scifi'] }],
]);
const bob = { targetDidHash: 'h-bob', activeBundles: ['rugby', 'scifi'] };

describe('revokeBundle', () => {
  it('keeps spaces another active bundle still covers (Journey C)', () => {
    const r = revokeBundle(bob, 'rugby', bundles);
    expect(r.revokeSpaceRefs).toEqual(['ctx-rugby']);
    expect(r.retainedSpaceRefs).toEqual(['cell']);
    expect(r.entry.activeBundles).toEqual(['scifi']);
  });

  it('revokes everything when the last bundle goes', () => {
    const r = revokeBundle({ ...bob, activeBundles: ['rugby'] }, 'rugby', bundles);
    expect(r.revokeSpaceRefs.sort()).toEqual(['cell', 'ctx-rugby']);
  });
});

describe('grantBundle', () => {
  it('grants only spaces the recipient did not already hold', () => {
    const r = grantBundle({ targetDidHash: 'h', activeBundles: ['rugby'] }, 'scifi', bundles);
    expect(r.grantSpaceRefs).toEqual(['ctx-scifi']);
  });
});

describe('rebundle', () => {
  it('diffs every holder when a bundle definition changes', () => {
    const diff = rebundle([bob], bundles, { id: 'rugby', spaceRefs: ['ctx-rugby', 'home'] });
    // cell is still held via scifi, so it is not revoked.
    expect(diff).toEqual([{ targetDidHash: 'h-bob', grant: ['home'], revoke: [] }]);
  });
});
