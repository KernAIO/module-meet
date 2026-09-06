---
'@kernhq/module-meet': minor
---

feat: answer config.get and mint a join token for one room

`/api/meet` mounts three procedures. `meet.config.get` reports whether LiveKit is configured,
whether it is reachable (a real `listRooms()`), the browser's media URL and the workspace's
participant limit — behind workspace membership and `meet.call.join`, and deliberately behind **no
capability**, so an administrator whose meetings do not work can find out why. `meetings.start` and
`meetings.join` sit behind `requiresCapability('meet', 'calls')`, which defaults to off, so a
workspace that has touched nothing answers 404 to both.

`meetings.join` is the only place a LiveKit token is minted. The grant is `roomJoin` for one room
name the server derived, plus publish, subscribe and data; it carries neither `roomAdmin` nor
`roomCreate`, fixes `identity` to the Kern user id, and expires in ten minutes.
