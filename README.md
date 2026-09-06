# @kernhq/module-meet

The meetings module for [Kern](https://github.com/KernAIO/app).

**One screen is built: a meeting, at `/{workspace}/meet/m/{id}`.** It renders a pre-join with a
camera preview and device pickers, then a stage, a participant strip, a control bar for microphone,
camera, screen share and leaving, and an in-meeting chat panel that says out loud that its messages
end with the meeting. There is no navigation row yet, because there is nowhere for one to land:
rooms and a meetings home are a later slice.

**Nobody has held a call with it.** No two people have connected through a LiveKit server, no audio
or video has crossed a network, and no screen has been shared. What has been exercised is the screen
itself against fixture data and the server against a scratch database — every state renders, the
token carries the right grant, and the module is inert in a workspace that has not switched `calls`
on. None of that is the same claim as "it works", and this file will not make that claim until two
people on two machines on two different networks have seen and heard each other. That run is the
acceptance test for the meetings release; until it passes, treat this module as built and unproven.

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
