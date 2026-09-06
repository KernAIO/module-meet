# @kernhq/module-meet

## 0.5.0

### Minor Changes

- 7504fc8: feat: start a meeting and be in it

  The module ships its first screen: `/{workspace}/meet/m/{id}`, behind `meet.call.join` and the
  `calls` capability, plus a `meet.start` command that opens one. A pre-join screen previews the
  camera, meters the microphone and remembers which camera, microphone and speaker somebody chose;
  joining calls `meetings.join` — still the only place a LiveKit token is minted — and connects. In
  the call there is an active-speaker stage with a strip, a participant list, a screen share that
  takes the stage, and a chat panel whose header says in five locales that its messages end with the
  meeting.

  The states are the screen, and each is a screen rather than a toast: connecting; the browser
  refusing the camera, with the three steps that re-grant it; no devices found, offering to join and
  listen; an insecure context, saying that a plain-HTTP install is why there is no camera rather than
  letting the browser blame the reader; reconnecting, as a band that keeps the tiles; a connection
  that failed, naming the blocked UDP path; alone in the meeting, with a copy-link button; ended; a
  meeting in another workspace as 404; and an instance with no media server, naming
  `LIVEKIT_API_SECRET` and the `--profile calls` command.

  `livekit-client` is reachable only through the route's own dynamic import and then only when
  somebody presses Join, so a WebRTC SDK never reaches the first paint of a page in a workspace that
  has meetings switched off; `bundle.test.ts` walks the import graph and holds it there. The
  screen-share button is absent, not disabled, where the browser has no `getDisplayMedia`.

## 0.4.0

### Minor Changes

- 851e94d: feat: keep occupancy and history true without asking a browser

  `participants` and `meetings` now have exactly two writers, and neither is a client. A client that
  reports its own attendance reports it wrong the moment it crashes, and the row it leaves behind puts
  a face on the rooms page belonging to somebody who went home an hour ago.

  The first writer is a raw HTTP route at `POST /api/meet/webhooks/livekit`, which is the address
  `livekit.yaml`'s `webhook:` block names. It verifies LiveKit's JWT and then checks the signed digest
  against the **exact bytes that arrived** — `raw: true` hands the handler a `Buffer`. Verified against
  a real `livekit/livekit-server:1.13.6`, whose `room_started` and `room_finished` deliveries both
  verify and are both refused with one byte flipped. It applies `room_started`, `participant_joined`
  (idempotent against the partial unique
  index, because LiveKit retries), `participant_left` and `room_finished`, which closes the meeting and
  emits the new `meet.meeting.ended` event exactly once. It answers **401 to everything when
  `LIVEKIT_API_SECRET` is empty**, so an instance that has not enabled meetings has no unauthenticated
  write endpoint, and 5xx for anything it could not apply, so LiveKit retries rather than the event
  being lost.

  The second is `meet.reconcile`, a job on a one-minute clock that binds `app.workspace_id = '*'`, asks
  LiveKit which rooms and participants exist, closes meetings whose room is gone (`reconciled`, with a
  two-minute grace period so a call is not ended between its row being written and the first browser
  connecting) and stamps out anybody the media server no longer sees.

## 0.3.0

### Minor Changes

- f7cb7b6: feat: answer config.get and mint a join token for one room

  `/api/meet` mounts three procedures. `meet.config.get` reports whether LiveKit is configured,
  whether it is reachable (a real `listRooms()`), the browser's media URL and the workspace's
  participant limit — behind workspace membership and `meet.call.join`, and deliberately behind **no
  capability**, so an administrator whose meetings do not work can find out why. `meetings.start` and
  `meetings.join` sit behind `requiresCapability('meet', 'calls')`, which defaults to off, so a
  workspace that has touched nothing answers 404 to both.

  `meetings.join` is the only place a LiveKit token is minted. The grant is `roomJoin` for one room
  name the server derived, plus publish, subscribe and data; it carries neither `roomAdmin` nor
  `roomCreate`, fixes `identity` to the Kern user id, and expires in ten minutes.

## 0.2.5

### Patch Changes

- chore: check the packed tarball can resolve its own imports

## 0.2.4

### Patch Changes

- chore(renovate): drop dead @kernhq automerge rule

## 0.2.3

### Patch Changes

- build(deps): raise @kernhq/testing to ^0.1.14

## 0.2.2

### Patch Changes

- test: assert the settings field through the manifest, not the definition

## 0.2.1

### Patch Changes

- docs: describe what the package holds rather than calling it a skeleton

## 0.2.0

### Minor Changes

- 97eb2d4: Declare the meetings contract and schema, with the tests that hold them.

  Three permissions (`meet.call.join`, `meet.call.start`, `meet.call.host`) and two capabilities
  (`calls`, and `rooms` which depends on it). Both capabilities default to **off** and neither is
  `required`, which is what keeps the module inert in a workspace that never asked for meetings.

  Four tables in `mod_meet` — `rooms`, `meetings`, `participants`, `invites` — each with forced
  row-level security. Three partial unique indexes carry the invariants: one live meeting per room,
  one live huddle per object, one live participant row per person per meeting.

  No procedures, no client and no host registration: a service that imports this module gains the
  schema and no API surface.
