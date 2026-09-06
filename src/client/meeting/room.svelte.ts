import type { Participant, RemoteParticipant, Room, TrackPublication } from 'livekit-client'
import type { ChatLine } from './chat.js'
import { type ConnectFailure, classifyConnectError } from './connection.js'
import { displayName, type Tile } from './tiles.js'

/**
 * The live meeting, held in one place for the whole app.
 *
 * **A module singleton rather than component state, and that is the whole design.** A `Room` owns a
 * microphone, a camera and a peer connection; if it lived in the page component then opening an
 * issue would hang the call up, which is worse than having no call. Nothing in this slice navigates
 * away and stays connected — leaving the meeting screen still leaves the meeting — but the object
 * that has to survive that is this one, and putting it here now is what makes the persistent bar a
 * later slice rather than a rewrite.
 *
 * **`livekit-client` is imported for its types and loaded with `await import()`.** The shell's
 * registry imports every module's client barrel at build time, so anything this package reaches
 * statically from `src/client/index.ts` lands in the first paint of every Kern page in every
 * workspace — including workspaces with meetings switched off. The route's own `import()` already
 * splits this file into an async chunk; the second dynamic import means the SDK is not even parsed
 * until somebody presses Join, so the pre-join screen and the demo never load a WebRTC stack at
 * all. `bundle.test.ts` holds the first half and `pnpm build` in `shell` measures the second.
 */

export type MeetingStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'ended' | 'failed'

export interface ConnectOptions {
  url: string
  token: string
  /** Who you are on the tiles. The server fixes `identity`; this is the readable half. */
  name: string
  microphone: boolean
  camera: boolean
  cameraId: string | null
  microphoneId: string | null
  speakerId: string | null
}

/** What a data-channel message looks like on the wire. Versioned so a later shape can be ignored. */
interface WireChat {
  t: 'meet.chat.v1'
  body: string
}

class MeetingSession {
  status = $state<MeetingStatus>('idle')
  failure = $state<ConnectFailure | null>(null)
  meetingId = $state<string | null>(null)
  /** True while the fixtures are on screen: nothing is connected and nothing ever will be. */
  isDemo = $state(false)
  tiles = $state<Tile[]>([])
  messages = $state<ChatLine[]>([])
  micOn = $state(false)
  cameraOn = $state(false)
  sharing = $state(false)

  #room: Room | null = null
  #identity = ''
  #leaving = false

  /** Everybody but you — what the "you are the only one here" branch counts. */
  get others(): Tile[] {
    return this.tiles.filter((tile) => !tile.isLocal)
  }

  /**
   * Fill the screen from fixtures and connect to nothing.
   *
   * The demo path goes through the same session object and the same components as a real call, so
   * the sweep audits the screen the product renders rather than a second one written for it. What
   * it must never do is reach for a camera or a socket: `mock.ts` has no media server behind it,
   * and a demo that quietly asked for a camera would prompt a stranger for permission on a page
   * that cannot use it.
   */
  startDemo(meetingId: string, tiles: Tile[], messages: ChatLine[]) {
    this.#room = null
    this.isDemo = true
    this.meetingId = meetingId
    this.tiles = tiles
    this.messages = messages
    this.micOn = true
    this.cameraOn = false
    this.sharing = false
    this.failure = null
    this.status = 'live'
  }

  async connect(meetingId: string, options: ConnectOptions) {
    if (this.status === 'connecting' || this.status === 'live') return
    this.isDemo = false
    this.meetingId = meetingId
    this.failure = null
    this.messages = []
    this.tiles = []
    this.status = 'connecting'
    this.#leaving = false

    try {
      const lk = await import('livekit-client')
      const room = new lk.Room({
        adaptiveStream: true,
        dynacast: true,
        // The camera the person chose on the pre-join screen, carried into the connection rather
        // than switched afterwards: switching republishes, which shows everybody a black frame.
        videoCaptureDefaults: options.cameraId ? { deviceId: options.cameraId } : {},
        audioCaptureDefaults: options.microphoneId ? { deviceId: options.microphoneId } : {},
      })
      this.#room = room
      this.#identity = ''

      const sync = () => this.#sync(lk)
      for (const event of [
        lk.RoomEvent.ParticipantConnected,
        lk.RoomEvent.ParticipantDisconnected,
        lk.RoomEvent.TrackSubscribed,
        lk.RoomEvent.TrackUnsubscribed,
        lk.RoomEvent.TrackMuted,
        lk.RoomEvent.TrackUnmuted,
        lk.RoomEvent.LocalTrackPublished,
        lk.RoomEvent.LocalTrackUnpublished,
        lk.RoomEvent.ActiveSpeakersChanged,
        lk.RoomEvent.ParticipantNameChanged,
      ] as const) {
        room.on(event, sync)
      }

      /*
       * Reconnecting is a band over the tiles rather than a screen, and this is why: the tiles are
       * still true. Everybody in the meeting is still in it, LiveKit is re-establishing the
       * transport underneath, and replacing the grid with a spinner throws away the one piece of
       * information the person actually wants — who is still here.
       */
      room.on(lk.RoomEvent.Reconnecting, () => {
        if (this.status === 'live') this.status = 'reconnecting'
      })
      room.on(lk.RoomEvent.Reconnected, () => {
        if (this.status === 'reconnecting') this.status = 'live'
        sync()
      })
      room.on(lk.RoomEvent.Disconnected, () => {
        // A disconnect we asked for is a navigation, not an ending: `leave()` has already put the
        // session back to idle and the page is on its way somewhere else.
        if (this.#leaving) return
        this.status = 'ended'
        this.tiles = []
      })
      room.on(lk.RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant) => {
        this.#receive(payload, participant)
      })

      await room.connect(options.url, options.token)
      this.#identity = room.localParticipant.identity

      if (options.microphone) await room.localParticipant.setMicrophoneEnabled(true)
      if (options.camera) await room.localParticipant.setCameraEnabled(true)
      if (options.speakerId) await this.setDevice('speaker', options.speakerId)

      this.micOn = room.localParticipant.isMicrophoneEnabled
      this.cameraOn = room.localParticipant.isCameraEnabled
      this.status = 'live'
      sync()
    } catch (error) {
      this.failure = classifyConnectError(error)
      this.status = 'failed'
      await this.#dispose()
    }
  }

  async leave() {
    this.#leaving = true
    await this.#dispose()
    this.status = 'idle'
    this.tiles = []
    this.messages = []
    this.meetingId = null
    this.isDemo = false
    this.failure = null
  }

  async toggleMicrophone() {
    if (this.isDemo) {
      this.micOn = !this.micOn
      return
    }
    const room = this.#room
    if (!room) return
    const next = !this.micOn
    await room.localParticipant.setMicrophoneEnabled(next)
    this.micOn = room.localParticipant.isMicrophoneEnabled
    await this.#resync()
  }

  async toggleCamera() {
    if (this.isDemo) {
      this.cameraOn = !this.cameraOn
      return
    }
    const room = this.#room
    if (!room) return
    const next = !this.cameraOn
    await room.localParticipant.setCameraEnabled(next)
    this.cameraOn = room.localParticipant.isCameraEnabled
    await this.#resync()
  }

  /**
   * Start or stop sharing a screen.
   *
   * The refusal a person meets most often here is their own: the browser's picker has a Cancel
   * button, and cancelling throws `NotAllowedError`. That is not an error to report — they changed
   * their mind — so it puts the button back and says nothing.
   */
  async toggleScreenShare() {
    if (this.isDemo) {
      this.sharing = !this.sharing
      return
    }
    const room = this.#room
    if (!room) return
    try {
      await room.localParticipant.setScreenShareEnabled(!this.sharing)
    } catch {
      // cancelled in the browser's own picker, or refused; either way the state below is the truth
    }
    this.sharing = room.localParticipant.isScreenShareEnabled
    await this.#resync()
  }

  async setDevice(kind: 'camera' | 'microphone' | 'speaker', deviceId: string) {
    const room = this.#room
    if (!room) return
    const map = { camera: 'videoinput', microphone: 'audioinput', speaker: 'audiooutput' } as const
    try {
      await room.switchActiveDevice(map[kind], deviceId)
    } catch {
      // Safari has no speaker selection at all and answers by throwing; the picker says so, and a
      // camera that has just been unplugged must not take the meeting down with it.
    }
    await this.#resync()
  }

  /**
   * Say something to the people in this meeting, and nowhere else.
   *
   * LiveKit's data channel, so there is no table, no transcript and nothing to delete afterwards —
   * which is what the panel's own header tells the reader, in every locale. A huddle that started
   * from a chat conversation has a durable place one click away; this is deliberately not it.
   */
  async send(body: string, fromName: string) {
    const text = body.trim()
    if (!text) return
    const line: ChatLine = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from: fromName,
      body: text,
      at: Date.now(),
      mine: true,
    }
    this.messages = [...this.messages, line]
    if (this.isDemo) return
    const room = this.#room
    if (!room) return
    const payload: WireChat = { t: 'meet.chat.v1', body: text }
    await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(payload)), {
      reliable: true,
    })
  }

  #receive(payload: Uint8Array, participant?: RemoteParticipant) {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(payload)) as Partial<WireChat>
      // Anything that is not this module's own message belongs to somebody else on the same
      // channel: ignored rather than rendered, because a data channel is shared with whatever the
      // next slice puts on it.
      if (parsed.t !== 'meet.chat.v1' || typeof parsed.body !== 'string') return
      this.messages = [
        ...this.messages,
        {
          id: `${Date.now()}-${participant?.identity ?? 'unknown'}`,
          from: displayName(participant?.name, participant?.identity ?? ''),
          body: parsed.body,
          at: Date.now(),
          mine: false,
        },
      ]
    } catch {
      // A malformed frame is not worth a broken panel.
    }
  }

  async #resync() {
    if (!this.#room) return
    const lk = await import('livekit-client')
    this.#sync(lk)
  }

  #sync(lk: typeof import('livekit-client')) {
    const room = this.#room
    if (!room) return
    const speaking = new Set(room.activeSpeakers.map((p) => p.identity))
    const people: Participant[] = [room.localParticipant, ...room.remoteParticipants.values()]
    this.tiles = people.map((person) => this.#tile(lk, person, speaking.has(person.identity)))
    this.micOn = room.localParticipant.isMicrophoneEnabled
    this.cameraOn = room.localParticipant.isCameraEnabled
    this.sharing = room.localParticipant.isScreenShareEnabled
  }

  #tile(lk: typeof import('livekit-client'), person: Participant, speaking: boolean): Tile {
    const share = person.getTrackPublication(lk.Track.Source.ScreenShare)
    const camera = person.getTrackPublication(lk.Track.Source.Camera)
    const publication: TrackPublication | undefined = share?.track ? share : camera
    const track = publication?.track && !publication.isMuted ? publication.track : null
    const isLocal = person.identity === this.#identity
    return {
      id: person.identity,
      name: displayName(person.name, person.identity),
      isLocal,
      speaking,
      micOn: person.isMicrophoneEnabled,
      cameraOn: person.isCameraEnabled,
      sharing: Boolean(share?.track),
      placeholder: 'camera_off',
      attach: track ? (el: HTMLVideoElement) => void track.attach(el) : null,
      detach: track ? (el: HTMLVideoElement) => void track.detach(el) : null,
    }
  }

  async #dispose() {
    const room = this.#room
    this.#room = null
    if (!room) return
    room.removeAllListeners()
    // `true` stops the local tracks: the camera light going out is the only proof a person has
    // that they left, and a page that keeps it on is the complaint everybody remembers.
    await room.disconnect(true)
  }
}

/**
 * One session for the app.
 *
 * Not per workspace: a person is in one call at a time, and the workspace it belongs to is on the
 * session itself. The shell keys its per-workspace surfaces so that switching workspace tears them
 * down — which is the right behaviour for a sidebar and the wrong one for a call, so the call is
 * deliberately not one of them.
 */
export const meetingSession = new MeetingSession()
