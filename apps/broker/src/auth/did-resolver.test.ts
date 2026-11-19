import { Secp256k1Keypair } from '@atproto/crypto';
import { describe, expect, it, vi } from 'vitest';
import { createHttpDidResolver } from './did-resolver';

const DID = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';

const mockFetch = (body: unknown) => vi.fn<typeof fetch>(async () => Response.json(body));

async function docFor(did: string) {
  const key = await Secp256k1Keypair.create();
  return { key, doc: { id: did, verificationMethod: [{ id: `${did}#atproto`, type: 'Multikey', controller: did, publicKeyMultibase: key.did().slice(8) }] } };
}

describe('createHttpDidResolver', () => {
  it('resolves did:plc from the PLC directory and caches it', async () => {
    const { key, doc } = await docFor(DID);
    const fetchMock = mockFetch(doc);
    const r = createHttpDidResolver({ fetch: fetchMock });
    expect(await r.signingKey(DID)).toBe(key.did());
    expect(await r.signingKey(DID)).toBe(key.did());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]).toEqual([`https://plc.directory/${DID}`, expect.anything()]);
  });

  it('bypasses the cache when asked for a fresh key', async () => {
    const { doc } = await docFor(DID);
    const fetchMock = mockFetch(doc);
    const r = createHttpDidResolver({ fetch: fetchMock });
    await r.signingKey(DID);
    await r.signingKey(DID, { fresh: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resolves host-level did:web from .well-known', async () => {
    const did = 'did:web:alice.example';
    const { key, doc } = await docFor(did);
    const fetchMock = mockFetch(doc);
    expect(await createHttpDidResolver({ fetch: fetchMock }).signingKey(did)).toBe(key.did());
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://alice.example/.well-known/did.json');
  });

  it.each(['did:web:alice.example:path', 'did:web:localhost%3A8080', 'did:key:z123', 'did:plc:SHORT'])('refuses %s without fetching', async (did) => {
    const fetchMock = mockFetch({});
    expect(await createHttpDidResolver({ fetch: fetchMock }).signingKey(did)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when the directory errors', async () => {
    const r = createHttpDidResolver({ fetch: async () => new Response('nope', { status: 404 }) });
    expect(await r.signingKey(DID)).toBeNull();
  });
});
