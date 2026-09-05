# @kernhq/module-meet

The meetings module for [Kern](https://github.com/KernAIO/app).

**Nothing is built yet.** This repository is the package skeleton: it compiles, it publishes, and it
carries no features. It declares no permissions, no capabilities, no procedures and no tables, and it
is registered in no Kern service and in no Kern screen — so installing it into a host adds an empty
`mod_meet` Postgres schema and changes nothing a person can see.

Kern does not do audio or video meetings today. `ROADMAP.md` in the umbrella repository is the
honest answer to when it will, and this file will say what the module does the day it does something.

## What is here

```
module-meet/
  src/contract/     what this module promises        ← empty
  src/server/       how it keeps that promise        ← the module definition and its schema
  src/client/       its screens and its strings      ← empty
  migrations/       its own Postgres schema          ← no migrations yet
```

`STRUCTURE.md` explains the shape, and it is the same shape as every other Kern module — first-party
or not. [`@kernhq/module-template`](https://github.com/KernAIO/module-template) is the Apache-2.0
starting point this was copied from.

## Working on it

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Node 24 and pnpm 10. The repository builds standalone against the published `@kernhq/*` packages,
which is what CI does; inside the umbrella workspace (`repos/module-meet`) pnpm links the local
copies instead.

`@kernhq/kernel` and `@kernhq/contracts` are **peer** dependencies, never plain ones: a host installs
exactly one kernel, and declaring the pairing as a peer is what makes an incompatible combination
something you can state. `pnpm lint` runs `scripts/check-ranges.mjs`, which holds every `@kernhq/*`
range to what is actually published — a caret on a 0.x version never crosses a minor, so a range that
was right when it was written stops reaching the framework the moment it moves.

## Licence

AGPL-3.0-only — see [LICENSE](./LICENSE). Kern's framework packages and the module template are
Apache-2.0 so that anyone can write a closed module; the product, first-party modules included, is
copyleft. See [LICENSING.md](https://github.com/KernAIO/app/blob/main/LICENSING.md).
