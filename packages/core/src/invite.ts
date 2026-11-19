import { z } from 'zod';
import { MAX_VCF_BYTES } from './sealed-vcf';

/**
 * The invite a broker token is bound to (PRD § 3.1). The token itself is never
 * stored: the broker keeps only its SHA-256 hash.
 */
export const ApprovalModeSchema = z.enum(['auto', 'manual']);

export const DidSchema = z.string().regex(/^did:[a-z]+:[a-zA-Z0-9._:%-]+$/, 'not a DID');

const b64url = z.string().regex(/^[A-Za-z0-9_-]+$/, 'not base64url');

/** Ciphertext only; the key is in the URL fragment and never reaches the broker. */
export const SealedVcfSchema = z.object({
  iv: b64url.length(16),
  // base64url of ≤ MAX_VCF_BYTES plaintext + 16-byte tag.
  ciphertext: b64url.max(Math.ceil(((MAX_VCF_BYTES + 16) * 4) / 3)),
});

export const CreateInviteSchema = z
  .object({
  bundleId: z.string().min(1).max(64),
  spaceRefs: z.array(z.string().min(1).max(512)).min(1).max(32),
  maxUses: z.number().int().min(1).max(1000),
  ttlSeconds: z.number().int().min(60).max(30 * 86_400),
  approvalMode: ApprovalModeSchema,
  // High-trust bundles default to no .vcf fallback.
  allowVcfFallback: z.boolean().default(false),
  sealedVcf: SealedVcfSchema.optional(),
})
  .refine((v) => !v.sealedVcf || v.allowVcfFallback, { message: 'sealedVcf requires allowVcfFallback', path: ['sealedVcf'] });
export type CreateInvite = z.infer<typeof CreateInviteSchema>;

/** What the broker keeps per invite. The sealed vCard is stored separately and deleted on first read. */
export const InviteSchema = z.object({
  issuerDid: DidSchema,
  bundleId: z.string().min(1).max(64),
  spaceRefs: z.array(z.string().min(1).max(512)).min(1).max(32),
  maxUses: z.number().int().min(1),
  uses: z.number().int().min(0),
  expiresAt: z.number().int(),
  approvalMode: ApprovalModeSchema,
  allowVcfFallback: z.boolean(),
});
export type Invite = z.infer<typeof InviteSchema>;
