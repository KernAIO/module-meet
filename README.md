# @kernhq/module-meet

The meetings module for [Kern](https://github.com/KernAIO/app).

**One screen works: a meeting, at `/{workspace}/meet/m/{id}`.** A person opens it, checks their
camera and microphone on a pre-join screen, joins, and is in a call with everybody else who opened
the same address — video, audio, screen sharing, a participant list and an in-meeting chat panel that
says out loud that its messages end with the meeting. There is no navigation row yet, because there
is nowhere for one to land: rooms and a meetings home are a later slice.

Both capabilities (`calls`, and `rooms`, which depends on it) default to **off**, and neither is
`required`. That is deliberate rather than incidental: a workspace that never asked for meetings gets
nothing, including a workspace that has existed for years, and every surface here names one of the
two — so the route is not mounted, the command is not in the palette, and the API answers 404 rather
than 403.

An instance also needs a media server. `meet.config.get` is the honest answer to whether it has one,
and it is behind **no** capability for exactly that reason: an administrator whose meetings do not
work has to be able to find out why. `ROADMAP.md` in the umbrella repository is where the release
this ships in is recorded.

## What is here

```
module-meet/
  src/contract/     what this module promises        ← permissions, capabilities, models, procedures
  src/server/       how it keeps that promise        ← the router, the LiveKit token, the schema
  src/client/       its screens and its strings      ← the meeting screen, in five locales
  migrations/       its own Postgres schema          ← rooms, meetings, participants, invites
```

`livekit-client` is imported **only** by `src/client/meeting/room.svelte.ts`, and there only through
a dynamic `import()`. The app's registry imports every module's client barrel at build time, so
anything reachable from `src/client/index.ts` is downloaded and parsed on the first paint of every
page in the product; a WebRTC SDK on that graph would cost every workspace, including the ones with
meetings switched off. `src/client/bundle.test.ts` walks the import graph and fails if that changes.

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
