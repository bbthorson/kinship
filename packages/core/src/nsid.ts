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
