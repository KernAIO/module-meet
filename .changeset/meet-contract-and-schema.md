---
'@kernhq/module-meet': minor
---

Declare the meetings contract and schema, with the tests that hold them.

Three permissions (`meet.call.join`, `meet.call.start`, `meet.call.host`) and two capabilities
(`calls`, and `rooms` which depends on it). Both capabilities default to **off** and neither is
`required`, which is what keeps the module inert in a workspace that never asked for meetings.

Four tables in `mod_meet` — `rooms`, `meetings`, `participants`, `invites` — each with forced
row-level security. Three partial unique indexes carry the invariants: one live meeting per room,
one live huddle per object, one live participant row per person per meeting.

No procedures, no client and no host registration: a service that imports this module gains the
schema and no API surface.
