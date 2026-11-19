import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { MemoryStore } from './store';

const ALICE = 'did:plc:alice';
const BOB = 'did:plc:bob';
const CAROL = 'did:plc:carol';

function setup(t = 1_000_000) {
  const store = new MemoryStore();
  const clock = { t };
  const app = createApp({
    store,
    publicBaseUrl: 'https://kinship.test',
    verifyCaller: async (r) => r.headers.get('x-did'),
    now: () => clock.t,
  });
  const call = (path: string, did: string | null, body?: unknown) =>
    app.request(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(did ? { 'x-did': did } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const invite = async (over: Record<string, unknown> = {}) => {
    const res = await call('/api/v1/invites', ALICE, {
      bundleId: 'rugby', spaceRefs: ['cell', 'ctx-rugby'], maxUses: 1, ttlSeconds: 86_400, approvalMode: 'auto', ...over,
    });
    expect(res.status).toBe(201);
    return ((await res.json()) as { data: { token: string } }).data.token;
  };
  return { store, clock, call, invite };
}

describe('broker', () => {
  it('requires auth to create invites', async () => {
    const { call } = setup();
    expect((await call('/api/v1/invites', null, {})).status).toBe(401);
  });

  it('auto bundle: redeem grants immediately, and a 1-use code cannot be reused', async () => {
    const { call, invite, store } = setup();
    const token = await invite();
    const [a, b] = await Promise.all([call(`/i/${token}/redeem`, BOB, {}), call(`/i/${token}/redeem`, CAROL, {})]);
    expect([a.status, b.status].sort()).toEqual([200, 410]);
    const winner = a.status === 200 ? BOB : CAROL;
    expect(await store.isAllowed(ALICE, 'cell', winner)).toBe(true);
  });

  it('rejects expired invites', async () => {
    const { call, invite, clock } = setup();
    const token = await invite({ ttlSeconds: 60 });
    clock.t += 61_000;
    expect((await call(`/i/${token}/redeem`, BOB, {})).status).toBe(410);
  });

  it('manual bundle: nothing is granted until the issuer approves', async () => {
    const { call, invite, store } = setup();
    const token = await invite({ approvalMode: 'manual' });
    const res = await call(`/i/${token}/redeem`, BOB, {});
    expect(res.status).toBe(202);
    const { requestId } = ((await res.json()) as { data: { requestId: string } }).data;
    expect(await store.isAllowed(ALICE, 'cell', BOB)).toBe(false);
    expect((await call(`/api/v1/requests/${requestId}/approve`, BOB, {})).status).toBe(404); // not the issuer
    expect((await call(`/api/v1/requests/${requestId}/approve`, ALICE, {})).status).toBe(200);
    expect(await store.isAllowed(ALICE, 'cell', BOB)).toBe(true);
  });

  it('revokes only the spaces named', async () => {
    const { call, invite, store } = setup();
    await call(`/i/${await invite()}/redeem`, BOB, {});
    await call('/api/v1/revocations', ALICE, { did: BOB, spaceRefs: ['ctx-rugby'] });
    expect(await store.isAllowed(ALICE, 'ctx-rugby', BOB)).toBe(false);
    expect(await store.isAllowed(ALICE, 'cell', BOB)).toBe(true);
  });

  it('public preview never reveals space refs', async () => {
    const { call, invite } = setup();
    const body = JSON.stringify(await (await call(`/i/${await invite()}`, null)).json());
    expect(body).not.toContain('ctx-rugby');
  });
});
