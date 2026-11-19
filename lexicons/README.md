# Kinship lexicons

Record lexicons are here. **Space-type lexicons are not yet**:

| Space type | Policy (beta names) | Holds |
|---|---|---|
| `app.kinship.space.channel` | managed space, broker as `managingApp` (or member space; see `docs/open-questions.md`) | one `app.kinship.card.channel` |
| `app.kinship.space.context` | same | one `app.kinship.card.context` |
| `app.kinship.space.vault` | `com.atproto.personalspace.policy`, skey `self` | sealed `app.kinship.vault.*` and `app.kinship.dunbar.event` |

They wait for the 2026-12-01 beta's published shape for a `"type": "space"` definition, rather
than guessing one. Channel and context skeys are random (TIDs), never slugs (PRD § 1.2).

**NSID authority.** `app.kinship.*` is authorised by the domain `kinship.app`. Lexicon resolution
needs DNS control of it (`_lexicon.kinship.app` TXT). Confirm ownership before publishing; if the
domain isn't held, rename the namespace now while nothing depends on it.
