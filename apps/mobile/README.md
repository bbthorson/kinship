# Mobile client

There is no separate Kinship app. **Kinship replaces Vox Pop's contact management**, and its
client is Vox Pop's `apps/mobile` (Expo + op-sqlite), which adopts the packages here:

| From here | Replaces in Vox Pop's `apps/mobile` |
|---|---|
| `@kinship/dunbar` (rings, garden walk, algorithm catalogue) | the CRM's score / cadence / lifecycle |
| Sealed vault records (`app.kinship.vault.contact`) | CRM notes, tags and labels held by the BFF (`/api/v1/people/*`, `crm_enrichment_mirror`) |
| Channel/context spaces + the broker | nothing yet: contacts are device-only today |
| Shadow contacts (`sourceOfTruth = 'native'`) | the existing `expo-contacts` import |

## Migration, in outline

1. **Packages first.** Vox Pop's mobile app depends on `@kinship/dunbar` and runs it alongside the
   current CRM, read-only, to compare garden-walk output with today's scores.
2. **Vault.** Generate the vault key on device and seal existing CRM notes into
   `app.kinship.vault.contact`. Then stop writing them to the BFF and delete the server copy. This is
   the step that moves private notes off Vox Pop's servers.
3. **Spaces.** Channel/context spaces, bundles and the broker (Phase 2).

The packages stay free of React Native and op-sqlite imports, so they can be used inside Vox
Pop's repo or anywhere else. Where this code finally lives (this repo, or folded into Vox Pop) is
open, with the naming question in `docs/open-questions.md`.
