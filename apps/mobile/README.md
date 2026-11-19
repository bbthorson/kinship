# Kinship mobile client

Not started. Before scaffolding it, settle `docs/open-questions.md` § 1: Vox Pop's
`apps/mobile` is already an Expo + op-sqlite "phone + contacts replacement" with an
`expo-contacts` import and a self-grooming CRM. Whether Kinship is a separate app or
packages that app consumes decides what goes here.

`packages/dunbar` and `packages/core` are written as plain TypeScript with no React
Native or op-sqlite imports, so either answer can use them.
