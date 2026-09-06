import type { Meeting } from '../contract/index.js'
import type { ChatLine } from './meeting/chat.js'
import type { Tile } from './meeting/tiles.js'

/**
 * The in-memory implementation of this module's API, and the fixtures the demo meeting is made of.
 *
 * It satisfies the same contract types as the real client, so no screen has a second code path for
 * demos and end-to-end tests. The shell reports demo mode through `getHost().isMock` — a module
 * never checks an env var itself.
 *
 * **This module's mock is the one that cannot pretend, and pretending is the failure mode.** A
 * meeting is a media server, a camera and a peer connection; a demo has none of the three, so the
 * only honest demo is one that says so on the tile where a picture would be and connects to
 * nothing. The alternative — a grid of empty squares — reads as a broken feature, and a sweep that
 * walks it certifies a screen nobody can reach. So the fixtures below give the screen real people,
 * real names, a real control bar and a real chat panel, and the local tile carries the sentence
 * "No camera in the demo" instead of a black rectangle.
 *
 * Nothing here reaches `livekit-client`, and that is load-bearing rather than incidental: the demo
 * never loads a WebRTC stack, never asks a stranger's browser for a camera, and never opens a
 * socket. `tile.attach` is null on every fixture, which is exactly the shape a real participant
 * whose camera is off already has.
 */

/**
 * The meeting `/{ws}/meet/m/mock` opens.
 *
 * Not a uuid, deliberately. The contract types `meetingId` as `z.uuid()`, so this identifier
 * reaches the real server as a validation failure rather than as a lookup — which is right: it is a
 * demo address, it exists only in front of this file, and it must never resolve against a real
 * instance. Any *other* id handed to the mock answers `NOT_FOUND`, so the 404 branch is reachable
 * in the demo as well as in production.
 */
export const MOCK_MEETING_ID = 'mock'

/** What `getHost().isMock` cannot supply: a media server address that is visibly not real. */
const MOCK_MEDIA_URL = 'wss://meet.example.invalid/livekit'

/**
 * The people the **shell's** own mock puts in this workspace.
 *
 * Copied ids and names rather than a fetch, because this file has no client and no way to ask. The
 * coupling is deliberate and narrow, and it is the same one `module-inventory`'s mock carries:
 * without it every tile would say "A former member", which is a demo of the fallback rather than a
 * demo of the feature.
 */
const PEOPLE = [
  { id: '01920000-0000-7000-8000-000000000001', name: 'Maya Rivera' },
  { id: '01920000-0000-7000-8000-000000000002', name: 'Dan Brekke' },
  { id: '01920000-0000-7000-8000-000000000003', name: 'Tomás Lindqvist' },
] as const

/**
 * The demo meeting itself.
 *
 * `startedAt` is fixed rather than `now`, so two runs of the end-to-end sweep render the same
 * pixels: a duration that ticks is a screenshot that never matches the one before it.
 */
export const MOCK_MEETING: Meeting = {
  id: MOCK_MEETING_ID,
  // `WorkspaceId` is a branded string, so a literal has to say it means one. The value is the demo
  // workspace's id in the shell's own mock — the coupling named above.
  workspaceId: '01920000-0000-7000-8000-000000000010' as Meeting['workspaceId'],
  kind: 'direct',
  livekitRoom: 'kern-demo',
  roomId: null,
  object: null,
  title: null,
  startedBy: PEOPLE[0].id,
  startedAt: '2026-09-06T09:00:00.000Z',
  endedAt: null,
  endedReason: null,
  peakParticipants: 3,
}

/**
 * The tiles the demo stage draws.
 *
 * The first is you. It carries `placeholder: 'demo'`, which is the only thing in this module that
 * renders the "No camera in the demo" sentence — a real participant with a closed camera says
 * "Camera off", which is a different fact and deserves different words.
 *
 * One of the others is speaking, so the stage's own rule — a speaker takes the large tile — is
 * visible in the demo rather than merely implemented; and one is muted, so the strip shows both
 * states of the microphone badge.
 */
export function mockTiles(youLabel: string): Tile[] {
  return [
    {
      id: PEOPLE[0].id,
      name: youLabel,
      isLocal: true,
      speaking: false,
      micOn: true,
      cameraOn: false,
      sharing: false,
      placeholder: 'demo',
      attach: null,
      detach: null,
    },
    {
      id: PEOPLE[1].id,
      name: PEOPLE[1].name,
      isLocal: false,
      speaking: true,
      micOn: true,
      cameraOn: false,
      sharing: false,
      placeholder: 'demo',
      attach: null,
      detach: null,
    },
    {
      id: PEOPLE[2].id,
      name: PEOPLE[2].name,
      isLocal: false,
      speaking: false,
      micOn: false,
      cameraOn: false,
      sharing: false,
      placeholder: 'demo',
      attach: null,
      detach: null,
    },
  ]
}

/** Two lines, so the panel shows both sides of it rather than its empty state. */
export function mockMessages(): ChatLine[] {
  return [
    {
      id: 'demo-1',
      from: PEOPLE[1].name,
      body: 'Sharing the numbers in a second.',
      at: Date.parse('2026-09-06T09:02:00.000Z'),
      mine: false,
    },
    {
      id: 'demo-2',
      from: PEOPLE[0].name,
      body: 'Perfect — I have the report open.',
      at: Date.parse('2026-09-06T09:02:30.000Z'),
      mine: true,
    },
  ]
}

/**
 * A refusal shaped the way oRPC hands one to a screen.
 *
 * `code` is what the page branches on, and `NOT_FOUND` is the answer to a meeting in another
 * workspace as well as to one that never existed — never `FORBIDDEN`, which would tell a caller
 * that an id they guessed exists somewhere.
 */
class MockMeetError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'UNAVAILABLE',
    message: string,
  ) {
    super(message)
    this.name = 'MockMeetError'
  }
}

const joined = (meeting: Meeting) => ({
  meeting,
  token: 'demo.not.a.token',
  mediaUrl: MOCK_MEDIA_URL,
  expiresIn: 600,
})

/**
 * The mock API.
 *
 * `configured` is true because the interesting demo is the meeting screen, not the "nobody set this
 * up" screen — and the second one is still reachable from the demo, because a real instance answers
 * it and this module's own tests cover the branch. What the mock must not do is claim `reachable`
 * for a server that does not exist, so `reachable` is true only in the same sense `configured` is:
 * both describe the fixture, and nothing in the demo ever opens a socket to find out.
 */
export function createMockMeetApi() {
  return {
    config: {
      get: async () => ({
        configured: true,
        mediaUrl: MOCK_MEDIA_URL,
        reachable: true,
        maxParticipants: 20,
      }),
    },
    meetings: {
      start: async () => joined(MOCK_MEETING),
      join: async (input: { meetingId: string }) => {
        if (input.meetingId !== MOCK_MEETING_ID) throw new MockMeetError('NOT_FOUND', 'No such meeting.')
        return joined(MOCK_MEETING)
      },
    },
  }
}
