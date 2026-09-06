# @kernhq/module-meet

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
