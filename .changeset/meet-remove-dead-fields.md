---
'@kernhq/module-meet': patch
---

chore: remove four fields nothing reads

`ConnectOptions.name` was passed on every connect and read by nobody — the display name comes from
the token the server minted, which is the only place it can honestly come from, and a field that
looks like the client naming itself is a rule the next person will build on. `Tile.cameraOn` was
set from three places and read from none: whether there is a picture is `attach`, which is null
both for a closed camera and for a track that has not arrived. `MeetingSession.others` and
`meetKeys.all` had no callers either — the second because this module has no writes yet, so a key
for the blunt invalidation after one is a claim about a mechanism that does not exist.

No behaviour changes. Each of them is the same defect as a permission nothing checks, one size
down.
