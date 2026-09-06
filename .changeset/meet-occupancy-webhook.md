---
'@kernhq/module-meet': minor
---

feat: keep occupancy and history true without asking a browser

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
