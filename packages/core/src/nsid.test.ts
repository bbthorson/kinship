import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NSID } from './nsid';

const LEXICONS = join(import.meta.dirname, '../../../lexicons');

function lexiconIds(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return lexiconIds(p);
    if (!name.endsWith('.json')) return [];
    const doc: unknown = JSON.parse(readFileSync(p, 'utf8'));
    return typeof doc === 'object' && doc !== null && 'id' in doc && typeof doc.id === 'string' ? [doc.id] : [];
  });
}

describe('NSID', () => {
  it('covers every lexicon on disk, so a rename cannot miss one', () => {
    const known = new Set<string>(Object.values(NSID));
    for (const id of lexiconIds(LEXICONS)) expect(known, id).toContain(id);
  });
});
