import type { Invite } from '@kinship/core';

export interface PendingRequest {
  id: string;
  issuerDid: string;
  requesterDid: string;
  bundleId: string;
  spaceRefs: string[];
  createdAt: number;
  status: 'pending' | 'approved' | 'denied';
}

/**
 * Persistence port. `consumeInvite` MUST be atomic: a 1-use code redeemed by
 * two phones at once yields exactly one success (PRD § 3.1).
 */
export interface BrokerStore {
  putInvite(tokenHash: string, invite: Invite): Promise<void>;
  getInvite(tokenHash: string): Promise<Invite | null>;
  /** Increment uses iff unexpired and under cap. Returns the invite on success, null otherwise. */
  consumeInvite(tokenHash: string, now: number): Promise<Invite | null>;
  allow(issuerDid: string, spaceRefs: string[], allowedDid: string, now: number): Promise<void>;
  disallow(issuerDid: string, spaceRefs: string[], allowedDid: string): Promise<void>;
  isAllowed(issuerDid: string, spaceRef: string, did: string): Promise<boolean>;
  putPending(req: PendingRequest): Promise<void>;
  getPending(id: string): Promise<PendingRequest | null>;
  listPending(issuerDid: string): Promise<PendingRequest[]>;
  setPendingStatus(id: string, status: 'approved' | 'denied'): Promise<void>;
}

export class MemoryStore implements BrokerStore {
  private invites = new Map<string, Invite>();
  private allowed = new Set<string>();
  private pending = new Map<string, PendingRequest>();
  private key = (i: string, s: string, d: string) => `${i}\u0000${s}\u0000${d}`;

  async putInvite(h: string, inv: Invite) { this.invites.set(h, { ...inv }); }
  async getInvite(h: string) { return this.invites.get(h) ?? null; }
  async consumeInvite(h: string, now: number) {
    const inv = this.invites.get(h);
    if (!inv || inv.expiresAt <= now || inv.uses >= inv.maxUses) return null;
    inv.uses++;
    return { ...inv };
  }
  async allow(i: string, refs: string[], d: string) { for (const r of refs) this.allowed.add(this.key(i, r, d)); }
  async disallow(i: string, refs: string[], d: string) { for (const r of refs) this.allowed.delete(this.key(i, r, d)); }
  async isAllowed(i: string, r: string, d: string) { return this.allowed.has(this.key(i, r, d)); }
  async putPending(req: PendingRequest) { this.pending.set(req.id, { ...req }); }
  async getPending(id: string) { return this.pending.get(id) ?? null; }
  async listPending(i: string) { return [...this.pending.values()].filter((p) => p.issuerDid === i && p.status === 'pending'); }
  async setPendingStatus(id: string, status: 'approved' | 'denied') {
    const p = this.pending.get(id);
    if (p) p.status = status;
  }
}
