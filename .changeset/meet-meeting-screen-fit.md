---
'@kernhq/module-meet': patch
---

fix: make the meeting screen reachable, and fit on it

Four defects found by rendering the screen rather than by reading it, all of them invisible to a
type-check.

`?join=1` did nothing. `autoJoin` was read at component init, and the shell fills its navigation
singleton from an `$effect` in the app layout — which runs after its children have mounted — so
the value was always empty. It is `$derived` now. Underneath that sat a second one: the reset of a
stale session and the join were two effects, and `leave()` wrote its state *after* awaiting the
disconnect, so the reset landed in a microtask and wiped the meeting that had just started. They
are one effect, and `leave()` resets before it disposes — which is also better for a person, since
pressing Leave now changes the screen at once rather than when the network is done.

The big tile was 16:9 across the whole content area, which is around 500px on a laptop and pushes
the strip and the control bar — Leave included — below the fold. It states a height instead:
capping a tile that has a ratio keeps the ratio by shrinking the *width*, leaving the stage two
thirds of the way across the page.

A visually hidden `<span>` is 1px square with a clip-path rather than `display:none`, so a contrast
audit still measures its text: the "Muted" label inside a danger-toned badge came out at 3.19:1 in
dark mode. The badges carry `role="img"` and an `aria-label` now, and an unmuted microphone gets no
badge at all.

The pre-join also lists devices in the demo — `enumerateDevices` prompts for nothing, so the
pickers are the real ones while no camera is opened — and the microphone meter is drawn only while
a microphone is actually open, rather than as a bar that can never move.
