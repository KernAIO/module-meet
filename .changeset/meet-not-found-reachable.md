---
'@kernhq/module-meet': patch
---

fix: answer 404 for a meeting that does not exist, on every path into one

The auto-join path — `?join=1`, which is how a person who has already agreed skips the door — put
the demo's fixture participants on screen without asking the server anything. So a made-up meeting
id rendered three faces and a meeting nobody was in, where the same id typed into the pre-join
answered "No such meeting". Found by opening a made-up id rather than by reading the code, and it
is the shape of defect the mock exists to prevent rather than to cause: there is one join path now,
for the same reason there is one place a LiveKit token is minted.

The refusal also offers a way back to the workspace, and `meet.ended_back` becomes
`meet.back_to_workspace` because two screens say it.
