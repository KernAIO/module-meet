<script lang="ts">
import { Button, Icon, IconButton } from '@kernhq/ui'
import { untrack } from 'svelte'
import { t } from '../i18n.js'
import DeviceMenu from './DeviceMenu.svelte'
import {
  classifyMediaError,
  type DeviceKind,
  type DeviceOption,
  type MediaFailure,
  pickDevice,
  readDevicePreference,
  writeDevicePreference,
} from './media.js'

/**
 * The door.
 *
 * **Nobody is live before they meant to be.** The preview here is a plain `getUserMedia` stream
 * attached to a local `<video>`; nothing has been published, no token has been minted and the
 * meeting does not know this person exists. That is also why `livekit-client` is not reached from
 * this file: the SDK loads when Join is pressed, so a person who opens a meeting link and changes
 * their mind has downloaded no WebRTC stack at all.
 *
 * The demo takes the same path with the camera step removed. It must never ask for one: the demo is
 * how a stranger meets the product, and a permission prompt on a page that cannot use the answer is
 * the worst first impression a screen can make. So the tile says, in every locale, that there is no
 * camera in the demo — an explicit sentence rather than the blank rectangle that reads as broken.
 */
interface Props {
  isDemo: boolean
  joining: boolean
  onjoin: (options: {
    microphone: boolean
    camera: boolean
    cameraId: string | null
    microphoneId: string | null
    speakerId: string | null
  }) => void
  /** The page owns the refusal screens; this reports which one to draw. */
  onmediafailure: (failure: MediaFailure) => void
}
let { isDemo, joining, onjoin, onmediafailure }: Props = $props()

const store = typeof localStorage === 'undefined' ? null : localStorage
const secureContext = typeof window === 'undefined' ? true : window.isSecureContext

let wantCamera = $state(true)
let wantMicrophone = $state(true)
let cameras = $state<DeviceOption[]>([])
let microphones = $state<DeviceOption[]>([])
let speakers = $state<DeviceOption[]>([])
let cameraId = $state<string | null>(readDevicePreference(store, 'camera'))
let microphoneId = $state<string | null>(readDevicePreference(store, 'microphone'))
let speakerId = $state<string | null>(readDevicePreference(store, 'speaker'))
let videoEl = $state<HTMLVideoElement | null>(null)
let level = $state(0)

/**
 * `setSinkId` is what a speaker picker writes to, so its absence is what decides whether the picker
 * exists. A feature test rather than a browser name: the day Safari ships it, this starts offering
 * the control without anybody editing a list of user agents.
 */
const speakerSelectable = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype

let stream: MediaStream | null = null
let audio: { context: AudioContext; frame: number } | null = null
/**
 * Whether a microphone is actually open, which is what decides whether the meter is drawn at all.
 *
 * A bar that can never move is a broken-looking element rather than a quiet one: in the demo, and
 * with the microphone switched off, there is nothing for it to say and it is absent instead.
 */
let metering = $state(false)

function stopMeter() {
  metering = false
  level = 0
  if (!audio) return
  cancelAnimationFrame(audio.frame)
  void audio.context.close().catch(() => {})
  audio = null
}

function stopStream() {
  stopMeter()
  for (const track of stream?.getTracks() ?? []) track.stop()
  stream = null
}

/**
 * The level meter, from the raw samples rather than from a library.
 *
 * A browser may hand back a suspended `AudioContext` until the page has been clicked, in which case
 * this reads zero and the bar simply stays where it is — a meter that lies still is honest about
 * having nothing to say, and a thrown exception here would be a pre-join screen that will not open.
 */
function startMeter(source: MediaStream) {
  try {
    const Ctor =
      window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const context = new Ctor()
    const analyser = context.createAnalyser()
    analyser.fftSize = 512
    context.createMediaStreamSource(source).connect(analyser)
    const samples = new Uint8Array(analyser.frequencyBinCount)
    const tick = () => {
      analyser.getByteTimeDomainData(samples)
      let sum = 0
      for (const sample of samples) {
        const centred = (sample - 128) / 128
        sum += centred * centred
      }
      // Root mean square, then a gain that puts ordinary speech near the top of the bar.
      level = Math.min(1, Math.sqrt(sum / samples.length) * 3)
      if (audio) audio.frame = requestAnimationFrame(tick)
    }
    audio = { context, frame: requestAnimationFrame(tick) }
    metering = true
  } catch {
    // No meter is a smaller loss than no pre-join screen.
  }
}

/**
 * What is plugged in, and which of it to use.
 *
 * `enumerateDevices` **never prompts** — that is what makes it safe to call in the demo, where no
 * camera may be opened at all. Without permission the labels come back empty and the picker numbers
 * them, which is a good deal better than three rows reading "Nothing found" on a machine that
 * plainly has a camera.
 */
async function readDevices(devices: MediaDevices, wantedCamera: string | null, wantedMic: string | null) {
  const found = await devices.enumerateDevices().catch(() => [] as MediaDeviceInfo[])
  const of = (kind: MediaDeviceKind) =>
    found.filter((d) => d.kind === kind).map((d) => ({ deviceId: d.deviceId, label: d.label }))
  cameras = of('videoinput')
  microphones = of('audioinput')
  speakers = of('audiooutput')
  cameraId = pickDevice(cameras, wantedCamera)
  microphoneId = pickDevice(microphones, wantedMic)
  speakerId = pickDevice(speakers, speakerId)
}

async function openStream(
  camera: boolean,
  microphone: boolean,
  wantedCamera: string | null,
  wantedMic: string | null,
) {
  stopStream()
  const devices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices
  if (isDemo) {
    // The demo lists what is plugged in and opens none of it. Enumerating prompts for nothing, so
    // the pickers are the real ones and the camera light never comes on.
    if (devices) await readDevices(devices, wantedCamera, wantedMic)
    return
  }
  if (!secureContext) {
    onmediafailure('insecure')
    return
  }
  if (!camera && !microphone) return
  if (!devices) {
    // No `mediaDevices` at all is the same deployment as an insecure context, and saying "you
    // denied permission" to somebody who was never asked sends them to a settings page that
    // cannot help.
    onmediafailure(classifyMediaError(new Error('no mediaDevices'), secureContext))
    return
  }
  try {
    stream = await devices.getUserMedia({
      video: camera ? (wantedCamera ? { deviceId: { ideal: wantedCamera } } : true) : false,
      audio: microphone ? (wantedMic ? { deviceId: { ideal: wantedMic } } : true) : false,
    })
  } catch (error) {
    onmediafailure(classifyMediaError(error, secureContext))
    return
  }
  // Read *after* the stream: a browser leaves every label empty until permission has been granted
  // once, so asking first would number devices it is about to be able to name.
  await readDevices(devices, wantedCamera, wantedMic)
  if (videoEl) videoEl.srcObject = stream
  if (microphone && stream.getAudioTracks().length > 0) startMeter(stream)
}

/**
 * A counter rather than the ids themselves, because this effect **writes** the ids it would
 * otherwise depend on.
 *
 * `pickDevice` writes back what the browser actually gave — a remembered camera that has been
 * unplugged resolves to the first one — so an effect that read `cameraId` would re-run itself,
 * stop the camera it had just opened and open it again. That is a visible flicker on every load
 * and the shape this project has hit twice already: an effect that reads state it also sets.
 */
let deviceEpoch = $state(0)

$effect(() => {
  const camera = wantCamera
  const microphone = wantMicrophone
  void deviceEpoch
  const wanted = untrack(() => ({ camera: cameraId, mic: microphoneId }))
  untrack(() => void openStream(camera, microphone, wanted.camera, wanted.mic))
  return () => stopStream()
})

function chooseDevice(kind: DeviceKind, deviceId: string) {
  if (!deviceId) return
  writeDevicePreference(store, kind, deviceId)
  if (kind === 'camera') cameraId = deviceId
  else if (kind === 'microphone') microphoneId = deviceId
  else speakerId = deviceId
  // The speaker is not part of the capture, so switching it does not reopen anything.
  if (kind !== 'speaker') deviceEpoch += 1
}

/**
 * A plain flag set in the same tick as the click, rather than `disabled={joining}`.
 *
 * The attribute reaches the button on the next render and two quick clicks are one render apart, so
 * `disabled` files the second join anyway — and disabling the control somebody is standing on
 * throws their focus to `<body>`, which for a keyboard user means tabbing from the top of the page.
 */
let pressed = $state(false)
function join() {
  if (pressed || joining) return
  pressed = true
  stopStream()
  onjoin({
    microphone: wantMicrophone,
    camera: wantCamera,
    cameraId,
    microphoneId,
    speakerId,
  })
}
</script>

<div class="prejoin">
  <div class="stagecard">
    <div class="preview">
      {#if isDemo}
        <!-- Not a blank frame: the demo has no media server behind it and says so where the
             picture would be, so nobody reads an empty rectangle as a broken camera. -->
        <div class="placeholder" data-testid="meet-demo-tile">
          <Icon name="video" size={26} strokeWidth={1.4} />
          <span>{t('demo_no_camera')}</span>
        </div>
      {:else if wantCamera}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video bind:this={videoEl} autoplay playsinline muted aria-label={t('preview_label')}></video>
      {:else}
        <div class="placeholder">
          <Icon name="video" size={26} strokeWidth={1.4} />
          <span>{t('preview_off')}</span>
        </div>
      {/if}
    </div>

    <div class="bar" role="group" aria-label={t('devices')}>
      <IconButton
        icon="mic"
        size={34}
        variant={wantMicrophone ? 'secondary' : 'primary'}
        label={wantMicrophone ? t('mic_mute') : t('mic_unmute')}
        aria-pressed={!wantMicrophone}
        onclick={() => {
          wantMicrophone = !wantMicrophone
        }}
      />
      <IconButton
        icon="video"
        size={34}
        variant={wantCamera ? 'secondary' : 'primary'}
        label={wantCamera ? t('camera_stop') : t('camera_start')}
        aria-pressed={!wantCamera}
        onclick={() => {
          wantCamera = !wantCamera
        }}
      />
      <!--
        Only while a microphone is genuinely open. A bar that can never move reads as an element
        that failed to render, and in the demo — where nothing is captured — it would never move.
      -->
      {#if metering}
        <div class="meter" role="img" aria-label={t('mic_level')}>
          <span class="fill" style:inline-size={`${Math.round(level * 100)}%`}></span>
        </div>
      {/if}
    </div>
  </div>

  <div class="side">
    <h2 class="h">{t('prejoin_title')}</h2>
    <p class="p">{isDemo ? t('demo_notice') : t('prejoin_desc')}</p>

    <DeviceMenu
      {cameras}
      {microphones}
      {speakers}
      {cameraId}
      {microphoneId}
      {speakerId}
      {speakerSelectable}
      onchange={chooseDevice}
    />

    <Button variant="primary" size="lg" onclick={join} aria-busy={joining} data-testid="meet-join">
      {joining ? t('joining') : t('join')}
    </Button>
  </div>
</div>

<style>
.prejoin {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(260px, 0.65fr);
  gap: 24px;
  align-items: start;
}
.stagecard {
  display: grid;
  gap: 12px;
  min-width: 0;
}
.preview {
  position: relative;
  /* A stated height rather than a ratio, for the reason `VideoTile` records: a capped ratio keeps
     itself by shrinking the width, and Join has to stay on screen either way. */
  block-size: min(46vh, 380px);
  border-radius: var(--kern-r-2xl);
  overflow: hidden;
  background: var(--kern-surface-raised);
  border: 1px solid var(--kern-border);
}
.preview video {
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
  /* The preview is a mirror, the way a person expects to see themselves. Published video is not. */
  transform: scaleX(-1);
}
.placeholder {
  block-size: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  text-align: center;
  font-size: 13px;
  color: var(--kern-ink-500);
}
.bar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.meter {
  /* A fixed width beside the two buttons rather than the rest of the row: a full-width rule reads
     as a stray horizontal line, and a level meter only needs enough length to be read at a glance. */
  inline-size: 140px;
  block-size: 6px;
  border-radius: var(--kern-r-full);
  background: var(--kern-surface-raised);
  border: 1px solid var(--kern-border-hairline);
  overflow: hidden;
}
.fill {
  display: block;
  block-size: 100%;
  background: var(--kern-success);
  transition: inline-size 90ms linear;
}
.side {
  display: grid;
  gap: 14px;
  align-content: start;
}
.h {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--kern-ink-900);
}
.p {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--kern-ink-500);
}

@media (max-width: 860px) {
  .prejoin {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
