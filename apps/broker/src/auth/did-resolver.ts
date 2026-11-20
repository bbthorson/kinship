import { formatDidKey, parseMultikey } from '@atproto/crypto';
import { z } from 'zod';

/**
 * Resolves a DID to its atproto signing key, as a did:key.
 *
 * Only `did:plc` and host-level `did:web` are accepted: those are the methods
 * atproto accounts use. Only `Multikey` verification methods are read (what
 * PLC and current PDSs publish); the legacy `EcdsaSecp256k1VerificationKey2019`
 * form is rejected rather than half-supported.
 */

const VerificationMethod = z.object({
  id: z.string(),
  type: z.string(),
  controller: z.string().optional(),
  publicKeyMultibase: z.string().optional(),
});

const DidDocument = z.object({
  id: z.string(),
  verificationMethod: z.array(VerificationMethod).optional(),
});

export interface DidResolver {
  /** The `#atproto` signing key as a did:key, or null if the DID can't be resolved or has none. */
  signingKey(did: string, opts?: { fresh?: boolean }): Promise<string | null>;
}

const PLC = /^did:plc:[a-z2-7]{24}$/;
// did:web host only: no path segments (':' after the host) and no port.
const WEB = /^did:web:([a-z0-9.-]+)$/;

export function signingKeyFromDoc(did: string, doc: unknown): string | null {
  const parsed = DidDocument.safeParse(doc);
  if (!parsed.success || parsed.data.id !== did) return null;
  const vm = parsed.data.verificationMethod?.find((m) => m.id === '#atproto' || m.id === `${did}#atproto`);
  if (!vm || vm.type !== 'Multikey' || !vm.publicKeyMultibase) return null;
  try {
    const { jwtAlg, keyBytes } = parseMultikey(vm.publicKeyMultibase);
    return formatDidKey(jwtAlg, keyBytes);
  } catch {
    return null;
  }
}

export interface HttpDidResolverOptions {
  fetch?: typeof fetch;
  plcUrl?: string;
  /** How long a resolved key is trusted before re-fetching. */
  ttlMs?: number;
  now?: () => number;
}

/**
 * Resolves over HTTP with an in-memory cache. The cache lives per Worker
 * isolate, so it is a latency saving, not a source of truth; a verifier that
 * sees a bad signature asks again with `fresh: true` to catch key rotation.
 */
export function createHttpDidResolver(opts: HttpDidResolverOptions = {}): DidResolver {
  const doFetch = opts.fetch ?? fetch;
  const plcUrl = opts.plcUrl ?? 'https://plc.directory';
  const ttl = opts.ttlMs ?? 10 * 60_000;
  const now = opts.now ?? Date.now;
  const cache = new Map<string, { key: string; at: number }>();

  const docUrl = (did: string): string | null => {
    if (PLC.test(did)) return `${plcUrl}/${did}`;
    const web = WEB.exec(did);
    if (web) return `https://${web[1]}/.well-known/did.json`;
    return null;
  };

  return {
    async signingKey(did, { fresh = false } = {}) {
      const hit = cache.get(did);
      if (!fresh && hit && now() - hit.at < ttl) return hit.key;
      const url = docUrl(did);
      if (!url) return null;
      let doc: unknown;
      try {
        const res = await doFetch(url, { headers: { accept: 'application/did+json, application/json' }, redirect: 'error' });
        if (!res.ok) return null;
        doc = await res.json();
      } catch {
        return null;
      }
      const key = signingKeyFromDoc(did, doc);
      if (key) cache.set(did, { key, at: now() });
      else cache.delete(did);
      return key;
    },
  };
}
