import { BROKER_METHOD, CreateInviteSchema, DidSchema, type Invite } from '@kinship/core';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import type { BrokerStore } from './store';
import { fallbackPage } from './fallback-page';
import { hashToken, newToken } from './tokens';

/**
 * Resolves the caller's DID for a request to broker method `lxm`, or null.
 * In production: atproto service auth (`auth/service-auth.ts`).
 */
export type CallerVerifier = (req: Request, lxm: string) => Promise<string | null>;

/** Notifies the issuer (push with a 1-tap Revoke / Approve). Not built yet. */
export type IssuerNotifier = (issuerDid: string, event: { kind: 'redeemed' | 'pending'; requesterDid: string; bundleId: string }) => Promise<void>;

export interface AppDeps {
  store: BrokerStore;
  verifyCaller: CallerVerifier;
  notify?: IssuerNotifier;
  publicBaseUrl: string;
  /** The broker's own did:web. When set, `/.well-known/did.json` serves its document. */
  brokerDid?: string;
  now?: () => number;
}

export const BROKER_SERVICE_ID = 'kinship_broker';

type Vars = { Variables: { did: string } };

const ok = <T>(c: Context, data: T, status: 200 | 201 | 202 = 200) => c.json({ success: true as const, data }, status);
const fail = (c: Context, status: 400 | 401 | 403 | 404 | 409 | 410 | 501, message: string, code?: string) =>
  c.json({ success: false as const, error: { message, ...(code ? { code } : {}) } }, status);

export function createApp(deps: AppDeps) {
  const now = deps.now ?? Date.now;
  const notify = deps.notify ?? (async () => {});
  const app = new Hono<Vars>();

  const requireDid = (lxm: string) => async (c: Context<Vars>, next: () => Promise<void>) => {
    const did = await deps.verifyCaller(c.req.raw, lxm);
    if (!did || !DidSchema.safeParse(did).success) return fail(c, 401, 'authentication required', 'UNAUTHENTICATED');
    c.set('did', did);
    await next();
  };

  app.get('/health', (c) => ok(c, { ok: true }));

  // The broker's DID document: what callers put in `aud`, and how they find it.
  // No verification key: the broker signs nothing yet.
  app.get('/.well-known/did.json', (c) => {
    if (!deps.brokerDid) return fail(c, 404, 'no DID configured', 'NOT_FOUND');
    return c.json({
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: deps.brokerDid,
      service: [{ id: `#${BROKER_SERVICE_ID}`, type: 'KinshipBroker', serviceEndpoint: deps.publicBaseUrl }],
    });
  });

  // Issuer creates a capped invite. Returns the only copy of the bearer token.
  app.post('/api/v1/invites', requireDid(BROKER_METHOD.createInvite), async (c) => {
    const parsed = CreateInviteSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return fail(c, 400, parsed.error.message, 'INVALID_INPUT');
    const { ttlSeconds, sealedVcf, ...rest } = parsed.data;
    const token = newToken();
    const tokenHash = await hashToken(token);
    const invite: Invite = { ...rest, issuerDid: c.get('did'), expiresAt: now() + ttlSeconds * 1000, uses: 0 };
    await deps.store.putInvite(tokenHash, invite);
    if (sealedVcf) await deps.store.putSealedVcf(tokenHash, sealedVcf);
    // The client appends `#k=<vcf key>` itself; the broker never sees the key.
    return ok(c, { token, url: `${deps.publicBaseUrl}/i/${token}`, expiresAt: invite.expiresAt }, 201);
  });

  // Public, unauthenticated preview: who issued it and whether it's still live.
  // Deliberately reveals no space refs. Browsers get the fallback page; the app
  // asks for JSON.
  app.get('/i/:token', async (c) => {
    const inv = await deps.store.getInvite(await hashToken(c.req.param('token') ?? ''));
    if (!inv) return fail(c, 404, 'invite not found', 'NOT_FOUND');
    const live = inv.expiresAt > now() && inv.uses < inv.maxUses;
    if (c.req.header('accept')?.includes('text/html')) {
      const nonce = crypto.randomUUID().replace(/-/g, '');
      c.header('content-security-policy', `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'`);
      c.header('referrer-policy', 'no-referrer');
      c.header('cache-control', 'no-store');
      return c.html(fallbackPage({ live, allowVcfFallback: inv.allowVcfFallback, nonce }));
    }
    return ok(c, { issuerDid: inv.issuerDid, live, allowVcfFallback: inv.allowVcfFallback });
  });

  // One-time sealed vCard for a browser recipient. Counts as a redemption, so a
  // 1-use code handed out as a .vcf can't then be redeemed in the app too.
  // POST, not GET, so link previewers and prefetchers don't burn it.
  app.post('/i/:token/vcf', async (c) => {
    const tokenHash = await hashToken(c.req.param('token') ?? '');
    const inv = await deps.store.getInvite(tokenHash);
    if (!inv || !inv.allowVcfFallback) return fail(c, 404, 'no contact card for this invite', 'NOT_FOUND');
    if (inv.expiresAt <= now() || inv.uses >= inv.maxUses) return fail(c, 410, 'invite expired or used up', 'INVITE_SPENT');
    const vcf = await deps.store.takeSealedVcf(tokenHash);
    if (!vcf) return fail(c, 410, 'contact card already collected', 'VCF_TAKEN');
    if (!(await deps.store.consumeInvite(tokenHash, now()))) return fail(c, 410, 'invite expired or used up', 'INVITE_SPENT');
    c.header('cache-control', 'no-store');
    return ok(c, vcf);
  });

  // Recipient (signed in on Kinship) redeems.
  app.post('/i/:token/redeem', requireDid(BROKER_METHOD.redeemInvite), async (c) => {
    const tokenHash = await hashToken(c.req.param('token') ?? '');
    const requesterDid = c.get('did');
    const peek = await deps.store.getInvite(tokenHash);
    if (!peek) return fail(c, 404, 'invite not found', 'NOT_FOUND');
    if (peek.issuerDid === requesterDid) return fail(c, 409, 'cannot redeem your own invite', 'SELF_REDEEM');
    const inv = await deps.store.consumeInvite(tokenHash, now());
    if (!inv) return fail(c, 410, 'invite expired or used up', 'INVITE_SPENT');

    if (inv.approvalMode === 'auto') {
      await deps.store.allow(inv.issuerDid, inv.spaceRefs, requesterDid, now());
      await notify(inv.issuerDid, { kind: 'redeemed', requesterDid, bundleId: inv.bundleId });
      return ok(c, { status: 'granted' as const, issuerDid: inv.issuerDid, spaceRefs: inv.spaceRefs });
    }
    const id = crypto.randomUUID();
    await deps.store.putPending({
      id, issuerDid: inv.issuerDid, requesterDid, bundleId: inv.bundleId, spaceRefs: inv.spaceRefs, createdAt: now(), status: 'pending',
    });
    await notify(inv.issuerDid, { kind: 'pending', requesterDid, bundleId: inv.bundleId });
    return ok(c, { status: 'pending' as const, requestId: id }, 202);
  });

  app.get('/api/v1/requests', requireDid(BROKER_METHOD.listRequests), async (c) => ok(c, { items: await deps.store.listPending(c.get('did')), nextCursor: null }));

  app.post('/api/v1/requests/:id/:decision{approve|deny}', requireDid(BROKER_METHOD.decideRequest), async (c) => {
    const req = await deps.store.getPending(c.req.param('id') ?? '');
    if (!req || req.issuerDid !== c.get('did')) return fail(c, 404, 'request not found', 'NOT_FOUND');
    if (req.status !== 'pending') return fail(c, 409, `request already ${req.status}`, 'ALREADY_DECIDED');
    const approve = c.req.param('decision') === 'approve';
    if (approve) await deps.store.allow(req.issuerDid, req.spaceRefs, req.requesterDid, now());
    await deps.store.setPendingStatus(req.id, approve ? 'approved' : 'denied');
    return ok(c, { id: req.id, status: approve ? 'approved' : 'denied' });
  });

  // Issuer revokes spaces from a recipient. The device computes which spaces
  // via the Grant Ledger (reference counting), calls removeMembers on its PDS,
  // and tells the broker so its mirror of the member lists stays current.
  app.post('/api/v1/revocations', requireDid(BROKER_METHOD.revoke), async (c) => {
    const body = z
      .object({ did: DidSchema, spaceRefs: z.array(z.string().min(1)).min(1).max(32) })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return fail(c, 400, body.error.message, 'INVALID_INPUT');
    await deps.store.disallow(c.get('did'), body.data.spaceRefs, body.data.did);
    return ok(c, { revoked: body.data.spaceRefs });
  });

  // Reserved for a managed-space access check. Decision 0003 chose member
  // spaces, so the PDS holds membership and nothing calls this. It stays a 501
  // in case that decision is revisited once the beta docs land.
  app.all('/xrpc/*', (c) => fail(c, 501, 'access-check contract not yet confirmed', 'NOT_IMPLEMENTED'));

  return app;
}
