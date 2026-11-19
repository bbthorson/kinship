/**
 * Every NSID this codebase uses. "Kinship" and `app.kinship.*` are working
 * names (docs/open-questions.md § Naming); a rename changes this file and the
 * lexicon JSON, plus the algorithm ids in packages/dunbar/src/algorithms (which
 * are stored in users' vault prefs, so they're renamed with a fallback in mind).
 */
export const NS = 'app.kinship';

export const NSID = {
  cardProfile: `${NS}.card.profile`,
  cardChannel: `${NS}.card.channel`,
  cardContext: `${NS}.card.context`,
  spaceChannel: `${NS}.space.channel`,
  spaceContext: `${NS}.space.context`,
  spaceVault: `${NS}.space.vault`,
  vaultContact: `${NS}.vault.contact`,
  vaultBundle: `${NS}.vault.bundle`,
  vaultGrant: `${NS}.vault.grant`,
  vaultPrefs: `${NS}.vault.prefs`,
  vaultSealed: `${NS}.vault.sealed`,
  dunbarEvent: `${NS}.dunbar.event`,
} as const;

/**
 * Broker methods, used as the `lxm` claim of service-auth tokens: a token
 * minted for one method is refused by every other. The broker's routes are
 * REST, so these name the operation rather than an XRPC endpoint. An OAuth
 * client needs `rpc:<method>?aud=<broker did>` scope to mint each one.
 */
export const BROKER_METHOD = {
  createInvite: `${NS}.broker.createInvite`,
  redeemInvite: `${NS}.broker.redeemInvite`,
  listRequests: `${NS}.broker.listRequests`,
  decideRequest: `${NS}.broker.decideRequest`,
  revoke: `${NS}.broker.revoke`,
} as const;
