import { P256Keypair, Secp256k1Keypair, type Keypair } from '@atproto/crypto';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { MemoryStore } from '../store';
import { type DidResolver, signingKeyFromDoc } from './did-resolver';
import { createServiceAuthVerifier, MemoryReplayGuard } from './service-auth';

const BROKER = 'did:web:broker.test';
const ALICE = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const LXM = 'app.kinship.broker.createInvite';
const NOW = Date.UTC(2027, 0, 4);

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

async function jwt(key: Keypair, payload: Record<string, unknown>, header: Record<string, unknown> = {}) {
  const h = enc({ alg: key.jwtAlg, typ: 'JWT', ...header });
  const p = enc(payload);
  const sig = await key.sign(new TextEncoder().encode(`${h}.${p}`));
  return `Bearer ${h}.${p}.${b64url(sig)}`;
}

const claims = (over: Record<string, unknown> = {}) => ({
  iss: ALICE, aud: BROKER, lxm: LXM, iat: NOW / 1000, exp: NOW / 1000 + 60, jti: crypto.randomUUID(), ...over,
});

/** A resolver backed by a map we can rotate keys in. */
function fakeResolver(keys: Map<string, Keypair>) {
  const calls: { did: string; fresh: boolean }[] = [];
  const cached = new Map<string, string>();
  const resolver: DidResolver = {
    async signingKey(did, { fresh = false } = {}) {
      calls.push({ did, fresh });
      if (!fresh && cached.has(did)) return cached.get(did)!;
      const k = keys.get(did);
      if (!k) return null;
      cached.set(did, k.did());
      return k.did();
    },
  };
  return { resolver, calls };
}

async function setup(alg: 'k256' | 'p256' = 'k256') {
  const key = alg === 'k256' ? await Secp256k1Keypair.create() : await P256Keypair.create();
  const keys = new Map<string, Keypair>([[ALICE, key]]);
  const { resolver, calls } = fakeResolver(keys);
  const verify = createServiceAuthVerifier({
    audience: BROKER, serviceId: 'kinship_broker', resolver, replay: new MemoryReplayGuard(() => NOW), now: () => NOW,
  });
  return { key, keys, verify, calls };
}

describe('service auth', () => {
  it.each(['k256', 'p256'] as const)('accepts a valid %s token', async (alg) => {
    const { key, verify } = await setup(alg);
    expect(await verify(await jwt(key, claims()), LXM)).toEqual({ ok: true, did: ALICE });
  });

  it('accepts the did#service form of aud', async () => {
    const { key, verify } = await setup();
    expect((await verify(await jwt(key, claims({ aud: `${BROKER}#kinship_broker` })), LXM)).ok).toBe(true);
  });

  it.each([
    ['missing', undefined],
    ['malformed', 'Bearer not-a-jwt'],
  ])('rejects %s headers', async (reason, header) => {
    const { verify } = await setup();
    expect(await verify(header, LXM)).toEqual({ ok: false, reason });
  });

  it.each([
    ['expired', { exp: NOW / 1000 - 120 }],
    ['not_yet_valid', { iat: NOW / 1000 + 600, exp: NOW / 1000 + 700 }],
    ['lifetime_too_long', { exp: NOW / 1000 + 2 * 3600 }],
    ['wrong_audience', { aud: 'did:web:someone-else.test' }],
    ['wrong_method', { lxm: 'app.kinship.broker.revoke' }],
    ['wrong_method', { lxm: undefined }],
    ['bad_issuer', { iss: `${ALICE}#atproto_labeler` }],
    ['malformed', { jti: undefined }],
  ])('rejects %s', async (reason, over) => {
    const { key, verify } = await setup();
    expect(await verify(await jwt(key, claims(over)), LXM)).toEqual({ ok: false, reason });
  });

  it('rejects OAuth access tokens presented as service auth', async () => {
    const { key, verify } = await setup();
    expect(await verify(await jwt(key, claims(), { typ: 'at+jwt' }), LXM)).toEqual({ ok: false, reason: 'forbidden_typ' });
  });

  it('rejects a token signed by someone else', async () => {
    const { verify } = await setup();
    const mallory = await Secp256k1Keypair.create();
    expect(await verify(await jwt(mallory, claims()), LXM)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects an alg that does not match the key', async () => {
    const { key, verify } = await setup('k256');
    expect((await verify(await jwt(key, claims(), { alg: 'ES256' }), LXM)).ok).toBe(false);
  });

  it('rejects a replayed token', async () => {
    const { key, verify } = await setup();
    const token = await jwt(key, claims());
    expect((await verify(token, LXM)).ok).toBe(true);
    expect(await verify(token, LXM)).toEqual({ ok: false, reason: 'replayed' });
  });

  it('follows a key rotation by re-resolving once', async () => {
    const { keys, verify, calls } = await setup();
    await verify(await jwt(keys.get(ALICE)!, claims()), LXM); // warms the cache with the old key
    const rotated = await Secp256k1Keypair.create();
    keys.set(ALICE, rotated);
    expect((await verify(await jwt(rotated, claims()), LXM)).ok).toBe(true);
    expect(calls.at(-1)).toEqual({ did: ALICE, fresh: true });
  });

  it('reports an issuer that cannot be resolved', async () => {
    const { verify } = await setup();
    const key = await Secp256k1Keypair.create();
    expect(await verify(await jwt(key, claims({ iss: 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb' })), LXM)).toEqual({ ok: false, reason: 'unresolvable_issuer' });
  });
});

describe('signingKeyFromDoc', () => {
  it('reads the #atproto Multikey', async () => {
    const key = await Secp256k1Keypair.create();
    const doc = { id: ALICE, verificationMethod: [{ id: `${ALICE}#atproto`, type: 'Multikey', controller: ALICE, publicKeyMultibase: key.did().slice('did:key:'.length) }] };
    expect(signingKeyFromDoc(ALICE, doc)).toBe(key.did());
  });

  it('refuses a document for a different DID', async () => {
    const key = await Secp256k1Keypair.create();
    const doc = { id: 'did:plc:other', verificationMethod: [{ id: '#atproto', type: 'Multikey', publicKeyMultibase: key.did().slice(8) }] };
    expect(signingKeyFromDoc(ALICE, doc)).toBeNull();
  });
});

describe('broker routes with service auth', () => {
  it('binds each route to its method', async () => {
    const { key, verify } = await setup();
    const app = createApp({
      store: new MemoryStore(),
      publicBaseUrl: 'https://broker.test',
      brokerDid: BROKER,
      now: () => NOW,
      verifyCaller: async (r, lxm) => {
        const res = await verify(r.headers.get('authorization'), lxm);
        return res.ok ? res.did : null;
      },
    });
    const body = JSON.stringify({ bundleId: 'b', spaceRefs: ['s'], maxUses: 1, ttlSeconds: 3600, approvalMode: 'auto' });
    const post = async (lxm: string) =>
      app.request('/api/v1/invites', { method: 'POST', headers: { authorization: await jwt(key, claims({ lxm })), 'content-type': 'application/json' }, body });
    expect((await post('app.kinship.broker.revoke')).status).toBe(401);
    expect((await post(LXM)).status).toBe(201);
  });

  it('serves its DID document', async () => {
    const app = createApp({ store: new MemoryStore(), publicBaseUrl: 'https://broker.test', brokerDid: BROKER, verifyCaller: async () => null });
    const doc = (await (await app.request('/.well-known/did.json')).json()) as { id: string; service: { id: string }[] };
    expect(doc.id).toBe(BROKER);
    expect(doc.service[0]?.id).toBe('#kinship_broker');
  });
});
