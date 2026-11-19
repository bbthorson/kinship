/**
 * The one-time .vcf fallback for recipients without Kinship (PRD § 3.1),
 * without breaking "the broker holds no contact PII".
 *
 * The issuer's phone encrypts the vCard with a fresh AES-256-GCM key and sends
 * the broker only the ciphertext. The key travels in the invite URL's fragment
 * (`#k=…`), which browsers never send to a server. The recipient's browser
 * fetches the ciphertext once (the broker deletes it on read) and decrypts
 * locally. A broker breach yields ciphertext without keys.
 *
 * AES-GCM rather than the vault's XChaCha20-Poly1305 because the decrypting
 * side is a stock browser with WebCrypto and nothing else. On React Native,
 * WebCrypto needs a polyfill (react-native-quick-crypto).
 */

export const MAX_VCF_BYTES = 4096;

export interface SealedVcf {
  /** base64url, 12 bytes. */
  iv: string;
  /** base64url AES-GCM ciphertext + tag. */
  ciphertext: string;
}

export function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Encrypt on the issuer's device. Put `sealed` in the invite, `key` in the URL fragment. */
export async function sealVcf(vcf: string): Promise<{ sealed: SealedVcf; key: string }> {
  const plain = new TextEncoder().encode(vcf);
  if (plain.byteLength > MAX_VCF_BYTES) throw new Error(`vCard over ${MAX_VCF_BYTES} bytes`);
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  return { sealed: { iv: toBase64Url(iv), ciphertext: toBase64Url(ct) }, key: toBase64Url(raw) };
}

/** Decrypt in the recipient's browser. Throws if the key or ciphertext is wrong. */
export async function openVcf(sealed: SealedVcf, key: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', fromBase64Url(key), 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(sealed.iv) }, k, fromBase64Url(sealed.ciphertext));
  return new TextDecoder().decode(plain);
}
