# Kinship lexicons

Record lexicons are here. **Space-type lexicons are not yet**:

| Space type | Policy (beta names) | Holds |
|---|---|---|
| `app.kinship.space.channel` | `com.atproto.memberspace.policy` (decision 0003) | one `app.kinship.card.channel` |
| `app.kinship.space.context` | same | one `app.kinship.card.context` |
| `app.kinship.space.vault` | `com.atproto.personalspace.policy`, skey `self` | sealed `app.kinship.vault.*` and `app.kinship.dunbar.event` |

They wait for the 2026-12-01 beta's published shape for a `"type": "space"` definition, rather
than guessing one. Channel and context skeys are random (TIDs), never slugs (PRD § 1.2).

**The namespace is a working name.** Publishing makes an NSID permanent, and needs DNS control of
the authority domain (`_lexicon.<domain>` TXT). Decide the name first (`docs/open-questions.md`
§ Naming). Every id here must also be in `packages/core/src/nsid.ts`, and a test enforces it.
