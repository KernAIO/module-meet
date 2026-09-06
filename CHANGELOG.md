# @kernhq/module-meet

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
