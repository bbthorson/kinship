import { verifySignature } from '@atproto/crypto';
import { z } from 'zod';
import type { DidResolver } from './did-resolver';

/**
 * atproto inter-service auth: how a signed-in Kinship user proves their DID to
 * the broker.
 *
 * The client asks its own PDS for a token (`com.atproto.server.getServiceAuth`
 * with `aud` = the broker's DID and `lxm` = the broker method it is about to
 * call; an OAuth client needs the matching `rpc:` scope). The PDS signs a JWT
 * with the account's atproto signing key. The broker checks it against the
 * key in the caller's DID document. The broker never sees an OAuth token.
 *
 * Checks, in order: shape; `typ` is not an OAuth token type; not expired, not
 * issued in the future, lifetime bounded; `aud` is this broker; `lxm` is the
 * method being called (so a token for one method can't be spent on another);
 * `iss` is a plain account DID; the signature verifies against the issuer's
 * current key (re-resolved once on failure, for key rotation); `jti` unseen.
 */

export const MAX_TOKEN_LIFETIME_S = 60 * 60;
const CLOCK_SKEW_S = 30;

/** Tokens minted for OAuth must never be accepted as service auth. */
const FORBIDDEN_TYP = new Set(['at+jwt', 'refresh+jwt', 'dpop+jwt']);

const Header = z.object({
  alg: z.enum(['ES256K', 'ES256']),
  typ: z.string().optional(),
});

const Payload = z.object({
  iss: z.string(),
  aud: z.string(),
  exp: z.number().int(),
  iat: z.number().int().optional(),
  lxm: z.string().optional(),
  jti: z.string().min(1).max(256).optional(),
});

const ACCOUNT_DID = /^did:(plc|web):[a-zA-Z0-9._:%-]+$/;

/** Remembers token ids until they expire, so a captured token can't be replayed. */
export interface ReplayGuard {
  /** Records `jti`. Resolves false if it was already recorded. */
  claim(jti: string, expiresAtS: number): Promise<boolean>;
}

export class MemoryReplayGuard implements ReplayGuard {
  private seen = new Map<string, number>();
  constructor(private now: () => number = Date.now) {}
  async claim(jti: string, exp: number) {
    const nowS = this.now() / 1000;
    for (const [k, e] of this.seen) if (e < nowS) this.seen.delete(k);
    if (this.seen.has(jti)) return false;
    this.seen.set(jti, exp);
    return true;
  }
}

export type AuthFailure =
  | 'missing'
  | 'malformed'
  | 'forbidden_typ'
  | 'expired'
  | 'not_yet_valid'
  | 'lifetime_too_long'
  | 'wrong_audience'
  | 'wrong_method'
  | 'bad_issuer'
  | 'unresolvable_issuer'
  | 'bad_signature'
  | 'replayed';

export type AuthResult = { ok: true; did: string } | { ok: false; reason: AuthFailure };

export interface ServiceAuthOptions {
  /** The broker's own DID, e.g. did:web:broker.example. */
  audience: string;
  /** The broker's service id in its DID doc; `${audience}#${serviceId}` is also accepted as aud. */
  serviceId: string;
  resolver: DidResolver;
  replay: ReplayGuard;
  now?: () => number;
}

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJson(s: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(b64urlDecode(s)));
  } catch {
    return null;
  }
}

export function createServiceAuthVerifier(opts: ServiceAuthOptions) {
  const now = opts.now ?? Date.now;
  const audiences = new Set([opts.audience, `${opts.audience}#${opts.serviceId}`]);

  return async function verify(authorization: string | undefined | null, lxm: string): Promise<AuthResult> {
    if (!authorization?.startsWith('Bearer ')) return { ok: false, reason: 'missing' };
    const parts = authorization.slice(7).trim().split('.');
    if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) return { ok: false, reason: 'malformed' };
    const [h, p, s] = parts as [string, string, string];

    const header = Header.safeParse(decodeJson(h));
    const payload = Payload.safeParse(decodeJson(p));
    if (!header.success || !payload.success) return { ok: false, reason: 'malformed' };
    if (header.data.typ && FORBIDDEN_TYP.has(header.data.typ.toLowerCase())) return { ok: false, reason: 'forbidden_typ' };

    const { iss, aud, exp, iat, jti } = payload.data;
    const nowS = Math.floor(now() / 1000);
    if (exp <= nowS - CLOCK_SKEW_S) return { ok: false, reason: 'expired' };
    if (iat !== undefined && iat > nowS + CLOCK_SKEW_S) return { ok: false, reason: 'not_yet_valid' };
    if (exp - (iat ?? nowS) > MAX_TOKEN_LIFETIME_S) return { ok: false, reason: 'lifetime_too_long' };
    if (!audiences.has(aud)) return { ok: false, reason: 'wrong_audience' };
    if (payload.data.lxm !== lxm) return { ok: false, reason: 'wrong_method' };
    // A service DID (did:…#fragment) is not an account and can't hold invites.
    if (!ACCOUNT_DID.test(iss)) return { ok: false, reason: 'bad_issuer' };
    if (!jti) return { ok: false, reason: 'malformed' };

    const signed = new TextEncoder().encode(`${h}.${p}`);
    const sig = b64urlDecode(s);
    const check = async (fresh: boolean): Promise<boolean | null> => {
      const key = await opts.resolver.signingKey(iss, { fresh });
      if (!key) return null;
      try {
        return await verifySignature(key, signed, sig, { jwtAlg: header.data.alg });
      } catch {
        return false;
      }
    };
    let valid = await check(false);
    if (valid === false) valid = await check(true); // the key may have rotated
    if (valid === null) return { ok: false, reason: 'unresolvable_issuer' };
    if (!valid) return { ok: false, reason: 'bad_signature' };

    // Claim the jti last, so an invalid token can't burn a valid one's id.
    if (!(await opts.replay.claim(`${iss} ${jti}`, exp))) return { ok: false, reason: 'replayed' };
    return { ok: true, did: iss };
  };
}
