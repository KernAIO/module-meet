---
'@kernhq/module-meet': minor
---

feat: start a meeting and be in it

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
