# @kernhq/module-meet

## 0.5.4

### Patch Changes

- fix(meet): stop claiming a call nobody has held, and a cause nobody proved

## 0.5.3

### Patch Changes

- c16e361: chore: remove four fields nothing reads

  `ConnectOptions.name` was passed on every connect and read by nobody — the display name comes from
  the token the server minted, which is the only place it can honestly come from, and a field that
  looks like the client naming itself is a rule the next person will build on. `Tile.cameraOn` was
  set from three places and read from none: whether there is a picture is `attach`, which is null
  both for a closed camera and for a track that has not arrived. `MeetingSession.others` and
  `meetKeys.all` had no callers either — the second because this module has no writes yet, so a key
  for the blunt invalidation after one is a claim about a mechanism that does not exist.

  No behaviour changes. Each of them is the same defect as a permission nothing checks, one size
  down.

## 0.5.2

### Patch Changes

- 72bc4ec: fix: answer 404 for a meeting that does not exist, on every path into one

  The auto-join path — `?join=1`, which is how a person who has already agreed skips the door — put
  the demo's fixture participants on screen without asking the server anything. So a made-up meeting
  id rendered three faces and a meeting nobody was in, where the same id typed into the pre-join
  answered "No such meeting". Found by opening a made-up id rather than by reading the code, and it
  is the shape of defect the mock exists to prevent rather than to cause: there is one join path now,
  for the same reason there is one place a LiveKit token is minted.

  The refusal also offers a way back to the workspace, and `meet.ended_back` becomes
  `meet.back_to_workspace` because two screens say it.

## 0.5.1

### Patch Changes

- f121cc9: fix: make the meeting screen reachable, and fit on it

  Four defects found by rendering the screen rather than by reading it, all of them invisible to a
  type-check.

  `?join=1` did nothing. `autoJoin` was read at component init, and the shell fills its navigation
  singleton from an `$effect` in the app layout — which runs after its children have mounted — so
  the value was always empty. It is `$derived` now. Underneath that sat a second one: the reset of a
  stale session and the join were two effects, and `leave()` wrote its state _after_ awaiting the
  disconnect, so the reset landed in a microtask and wiped the meeting that had just started. They
  are one effect, and `leave()` resets before it disposes — which is also better for a person, since
  pressing Leave now changes the screen at once rather than when the network is done.

  The big tile was 16:9 across the whole content area, which is around 500px on a laptop and pushes
  the strip and the control bar — Leave included — below the fold. It states a height instead:
  capping a tile that has a ratio keeps the ratio by shrinking the _width_, leaving the stage two
  thirds of the way across the page.

  A visually hidden `<span>` is 1px square with a clip-path rather than `display:none`, so a contrast
  audit still measures its text: the "Muted" label inside a danger-toned badge came out at 3.19:1 in
  dark mode. The badges carry `role="img"` and an `aria-label` now, and an unmuted microphone gets no
  badge at all.

  The pre-join also lists devices in the demo — `enumerateDevices` prompts for nothing, so the
  pickers are the real ones while no camera is opened — and the microphone meter is drawn only while
  a microphone is actually open, rather than as a bar that can never move.

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
