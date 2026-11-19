import { type Invite, InviteSchema } from '@kinship/core';
import { z } from 'zod';
import type { BrokerStore, PendingRequest } from './store';

const InviteRow = z.object({
  issuer_did: z.string(),
  bundle_id: z.string(),
  space_refs: z.string(),
  max_uses: z.number(),
  uses: z.number(),
  expires_at: z.number(),
  approval_mode: z.string(),
  allow_vcf_fallback: z.number(),
});

const PendingRow = z.object({
  id: z.string(),
  issuer_did: z.string(),
  requester_did: z.string(),
  bundle_id: z.string(),
  space_refs: z.string(),
  created_at: z.number(),
  status: z.enum(['pending', 'approved', 'denied']),
});

const refs = (s: string) => z.array(z.string()).parse(JSON.parse(s));

function toInvite(row: unknown): Invite {
  const r = InviteRow.parse(row);
  return InviteSchema.parse({
    issuerDid: r.issuer_did,
    bundleId: r.bundle_id,
    spaceRefs: refs(r.space_refs),
    maxUses: r.max_uses,
    uses: r.uses,
    expiresAt: r.expires_at,
    approvalMode: r.approval_mode,
    allowVcfFallback: r.allow_vcf_fallback === 1,
  });
}

function toPending(row: unknown): PendingRequest {
  const r = PendingRow.parse(row);
  return {
    id: r.id,
    issuerDid: r.issuer_did,
    requesterDid: r.requester_did,
    bundleId: r.bundle_id,
    spaceRefs: refs(r.space_refs),
    createdAt: r.created_at,
    status: r.status,
  };
}

export class D1Store implements BrokerStore {
  constructor(private db: D1Database) {}

  async putInvite(h: string, i: Invite) {
    await this.db
      .prepare(
        `INSERT INTO invites (token_hash, issuer_did, bundle_id, space_refs, max_uses, uses, expires_at, approval_mode, allow_vcf_fallback)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(h, i.issuerDid, i.bundleId, JSON.stringify(i.spaceRefs), i.maxUses, i.uses, i.expiresAt, i.approvalMode, i.allowVcfFallback ? 1 : 0)
      .run();
  }

  async getInvite(h: string) {
    const row = await this.db.prepare('SELECT * FROM invites WHERE token_hash = ?').bind(h).first();
    return row ? toInvite(row) : null;
  }

  /** A single conditional UPDATE: SQLite serialises writes, so the cap cannot be overrun. */
  async consumeInvite(h: string, now: number) {
    const row = await this.db
      .prepare('UPDATE invites SET uses = uses + 1 WHERE token_hash = ? AND uses < max_uses AND expires_at > ? RETURNING *')
      .bind(h, now)
      .first();
    return row ? toInvite(row) : null;
  }

  async allow(i: string, spaceRefs: string[], d: string, now: number) {
    if (spaceRefs.length === 0) return;
    await this.db.batch(
      spaceRefs.map((r) =>
        this.db.prepare('INSERT OR IGNORE INTO allowlist (issuer_did, space_ref, allowed_did, granted_at) VALUES (?, ?, ?, ?)').bind(i, r, d, now),
      ),
    );
  }

  async disallow(i: string, spaceRefs: string[], d: string) {
    if (spaceRefs.length === 0) return;
    await this.db.batch(
      spaceRefs.map((r) => this.db.prepare('DELETE FROM allowlist WHERE issuer_did = ? AND space_ref = ? AND allowed_did = ?').bind(i, r, d)),
    );
  }

  async isAllowed(i: string, r: string, d: string) {
    const row = await this.db
      .prepare('SELECT 1 AS ok FROM allowlist WHERE issuer_did = ? AND space_ref = ? AND allowed_did = ?')
      .bind(i, r, d)
      .first();
    return row !== null;
  }

  async putPending(p: PendingRequest) {
    await this.db
      .prepare('INSERT INTO pending_requests (id, issuer_did, requester_did, bundle_id, space_refs, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(p.id, p.issuerDid, p.requesterDid, p.bundleId, JSON.stringify(p.spaceRefs), p.createdAt, p.status)
      .run();
  }

  async getPending(id: string) {
    const row = await this.db.prepare('SELECT * FROM pending_requests WHERE id = ?').bind(id).first();
    return row ? toPending(row) : null;
  }

  async listPending(i: string) {
    const { results } = await this.db
      .prepare("SELECT * FROM pending_requests WHERE issuer_did = ? AND status = 'pending' ORDER BY created_at")
      .bind(i)
      .all();
    return results.map(toPending);
  }

  async setPendingStatus(id: string, status: 'approved' | 'denied') {
    await this.db.prepare('UPDATE pending_requests SET status = ? WHERE id = ?').bind(status, id).run();
  }
}
