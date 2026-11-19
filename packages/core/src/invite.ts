import { z } from 'zod';

/**
 * The invite a broker token is bound to (PRD § 3.1). The token itself is never
 * stored: the broker keeps only its SHA-256 hash.
 */
export const ApprovalModeSchema = z.enum(['auto', 'manual']);

export const DidSchema = z.string().regex(/^did:[a-z]+:[a-zA-Z0-9._:%-]+$/, 'not a DID');

export const CreateInviteSchema = z.object({
  bundleId: z.string().min(1).max(64),
  spaceRefs: z.array(z.string().min(1).max(512)).min(1).max(32),
  maxUses: z.number().int().min(1).max(1000),
  ttlSeconds: z.number().int().min(60).max(30 * 86_400),
  approvalMode: ApprovalModeSchema,
  // High-trust bundles default to no .vcf fallback.
  allowVcfFallback: z.boolean().default(false),
});
export type CreateInvite = z.infer<typeof CreateInviteSchema>;

export const InviteSchema = CreateInviteSchema.omit({ ttlSeconds: true }).extend({
  issuerDid: DidSchema,
  expiresAt: z.number().int(),
  uses: z.number().int().min(0),
});
export type Invite = z.infer<typeof InviteSchema>;
