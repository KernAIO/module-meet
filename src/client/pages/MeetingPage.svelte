<script lang="ts">
import {
  Button,
  Dialog,
  EmptyState,
  getHost,
  navigation,
  Page,
  PageHeader,
  Skeleton,
  session,
} from '@kernhq/ui'
import { createQuery } from '@tanstack/svelte-query'
import { untrack } from 'svelte'
import { getMeetApi } from '../api-instance.js'
import { t } from '../i18n.js'
import ChatPanel from '../meeting/ChatPanel.svelte'
import ControlBar from '../meeting/ControlBar.svelte'
import { errorCode, meetingLink } from '../meeting/connection.js'
import DeviceMenu from '../meeting/DeviceMenu.svelte'
import {
  canShareScreen,
  type DeviceKind,
  type DeviceOption,
  type MediaFailure,
  readDevicePreference,
  writeDevicePreference,
} from '../meeting/media.js'
import ParticipantRail from '../meeting/ParticipantRail.svelte'
import PreJoin from '../meeting/PreJoin.svelte'
import { meetingSession } from '../meeting/room.svelte.js'
import Stage from '../meeting/Stage.svelte'
import { mockMessages, mockTiles } from '../mock.js'
import { meetKeys } from '../query.js'

/**
 * One meeting: the door, the room, and every way both of them can fail.
 *
 * **The states are the screen.** A call has more ways of not happening than of happening, and every
 * one of them used to arrive as the browser's own words — a bare `NotAllowedError` that reads as
 * "you denied permission" on a page that was never allowed to ask, a silent hang where the network
 * dropped the media, an empty grid where nobody had configured a media server. Each of those is a
 * different sentence with a different thing to do about it, so each is a screen here rather than a
 * toast: a toast is gone before somebody has read it, and none of these is recoverable by trying
 * the same thing again.
 *
 * Two of them exist because of decisions made elsewhere in Kern and would otherwise be invisible.
 * **Insecure context**: Kern supports an IP-only HTTP install (`ACME_EMAIL=internal`), where a
 * browser refuses the camera before this module is asked — so the page checks `isSecureContext`
 * itself and says why, rather than passing on a refusal that blames the reader. **Not configured**:
 * the `calls` Compose profile is not in a default install, so `meet.config.get` is asked on every
 * open and names the exact variable and the exact command.
 *
 * `livekit-client` is nowhere in this file's imports. The SDK is loaded by `room.svelte.ts` with a
 * dynamic `import()` at the moment somebody presses Join, which is what keeps a WebRTC stack out of
 * the pre-join screen, out of the demo, and — with the route's own `import()` — out of the first
 * paint of every other page in the product.
 */
interface Props {
  workspaceId: string
  workspaceSlug: string
  params: Record<string, string>
}
let { workspaceId, workspaceSlug, params }: Props = $props()

const api = getMeetApi()
const isDemo = getHost().isMock
const meetingId = $derived(params.meetingId ?? '')

/**
 * `?join=1` means "I have already agreed to be in this" and skips the door.
 *
 * Read once, at mount, and never written into the link this screen hands out: an invitation goes to
 * the pre-join, because somebody following a link has not agreed to anything yet. It exists for the
 * other direction — the moment a person accepts a ring, which is the next slice, and the demo,
 * where it is what puts the meeting screen itself in front of the end-to-end sweep.
 */
const autoJoin = navigation.search.join === '1'

const configQuery = createQuery(() => ({
  queryKey: meetKeys.config(workspaceId),
  enabled: Boolean(workspaceId),
  queryFn: () => api.config.get({ workspaceId }),
}))

const secureContext = typeof window === 'undefined' ? true : window.isSecureContext
const canShare = typeof navigator === 'undefined' ? false : canShareScreen(navigator.mediaDevices)

let mediaFailure = $state<MediaFailure | null>(null)
let joinError = $state<unknown>(null)
let joining = $state(false)
let peopleOpen = $state(false)
let chatOpen = $state(false)
let devicesOpen = $state(false)
let linkCopied = $state(false)

const configured = $derived(configQuery.data?.configured ?? false)
const status = $derived(meetingSession.status)

/**
 * Which screen, in the order the answers stop being useful.
 *
 * Configuration first: on an instance with no media server every other state below is noise, and
 * the administrator reading it needs the variable rather than a permission prompt. The secure
 * context is next for the same reason — no camera on this page is a property of the address bar,
 * not of anything the person did.
 */
type Screen =
  | 'loading'
  | 'not_configured'
  | 'insecure'
  | 'not_found'
  | 'error'
  | 'denied'
  | 'no_devices'
  | 'prejoin'
  | 'connecting'
  | 'live'
  | 'failed'
  | 'ended'

const screen = $derived.by((): Screen => {
  if (configQuery.isPending) return 'loading'
  if (!configured) return 'not_configured'
  if (!secureContext) return 'insecure'
  if (joinError) {
    const code = errorCode(joinError)
    if (code === 'NOT_FOUND') return 'not_found'
    if (code === 'UNAVAILABLE') return 'not_configured'
    return 'error'
  }
  if (status === 'connecting') return 'connecting'
  if (status === 'failed') return 'failed'
  if (status === 'ended') return 'ended'
  if (status === 'live' || status === 'reconnecting') return 'live'
  if (mediaFailure === 'permission_denied') return 'denied'
  if (mediaFailure === 'no_devices' || mediaFailure === 'in_use') return 'no_devices'
  if (mediaFailure === 'insecure') return 'insecure'
  if (mediaFailure === 'unknown') return 'error'
  return 'prejoin'
})

const workspace = $derived(session.workspaces.find((w) => w.id === workspaceId))
const myName = $derived(session.user?.name ?? t('you'))

/**
 * A session left over from another meeting must not be drawn under this one's name, and leaving the
 * page leaves the meeting.
 *
 * `untrack` around the read, or the effect depends on the state it writes and re-runs itself — the
 * shape that turned chat's page effect into a loop that resurrected the channel somebody had just
 * left. The nothing-survives-navigation half is deliberate for this slice: the persistent bar that
 * keeps a call alive while somebody opens an issue is the next one, and it is the reason the
 * session is a module singleton rather than state in this component.
 */
$effect(() => {
  const id = meetingId
  if (!id) return
  if (untrack(() => meetingSession.meetingId) !== id) void meetingSession.leave()
  return () => {
    void meetingSession.leave()
  }
})

/**
 * The demo, and a link that says "already agreed", both skip the door.
 *
 * Everything inside `untrack`, because `join()` reads and writes `joining` — an effect that
 * depended on it would fire itself the moment it started working.
 */
$effect(() => {
  const id = meetingId
  if (!id || !autoJoin) return
  untrack(() => {
    if (meetingSession.status !== 'idle') return
    if (isDemo) meetingSession.startDemo(id, mockTiles(t('you')), mockMessages())
    else void join({ microphone: true, camera: true, cameraId: null, microphoneId: null, speakerId: null })
  })
})

interface JoinChoice {
  microphone: boolean
  camera: boolean
  cameraId: string | null
  microphoneId: string | null
  speakerId: string | null
}

/**
 * The one place this screen asks the server for anything that matters.
 *
 * `meetings.join` mints the token, and it is the only procedure in Kern that does. It is called
 * when somebody presses Join rather than when the page opens, so a person who follows a link and
 * changes their mind is never recorded as having been in the meeting and never holds a credential
 * for it. The cost is that a meeting in another workspace is not known to be missing until then,
 * which is the honest trade: there is no procedure that answers "does this exist" without also
 * letting you in.
 */
async function join(choice: JoinChoice) {
  if (joining) return
  joining = true
  joinError = null
  mediaFailure = null
  try {
    if (isDemo) {
      // Still a real call: the mock answers NOT_FOUND for any id but its own, so the 404 branch is
      // reachable in the demo rather than only against a server.
      await api.meetings.join({ workspaceId, meetingId })
      meetingSession.startDemo(meetingId, mockTiles(t('you')), mockMessages())
      return
    }
    const admitted = await api.meetings.join({ workspaceId, meetingId })
    await meetingSession.connect(meetingId, {
      url: admitted.mediaUrl,
      token: admitted.token,
      name: myName,
      microphone: choice.microphone,
      camera: choice.camera,
      cameraId: choice.cameraId,
      microphoneId: choice.microphoneId,
      speakerId: choice.speakerId,
    })
  } catch (error) {
    joinError = error
  } finally {
    joining = false
  }
}

/** Leaving puts somebody back at the door of the meeting they left, so they can walk back in. */
async function leave() {
  await meetingSession.leave()
  peopleOpen = false
  chatOpen = false
}

function retry() {
  joinError = null
  mediaFailure = null
  void meetingSession.leave()
}

async function copyLink() {
  const origin = typeof location === 'undefined' ? '' : location.origin
  const link = meetingLink(origin, workspaceSlug, meetingId)
  try {
    await navigator.clipboard.writeText(link)
    linkCopied = true
    setTimeout(() => {
      linkCopied = false
    }, 2500)
  } catch {
    // A clipboard a browser refuses is not worth an error screen; the address bar still holds it.
  }
}

const store = typeof localStorage === 'undefined' ? null : localStorage

/**
 * The device lists the in-call picker offers.
 *
 * Read when the dialog opens rather than held from the pre-join: a headset plugged in during a
 * meeting is exactly when somebody opens this, and a list captured at the door would not have it.
 * Labels are populated by then — a browser names devices only after the permission has been
 * granted once, which it has, because there is a meeting on screen.
 */
let cameras = $state<DeviceOption[]>([])
let microphones = $state<DeviceOption[]>([])
let speakers = $state<DeviceOption[]>([])
let cameraId = $state<string | null>(readDevicePreference(store, 'camera'))
let microphoneId = $state<string | null>(readDevicePreference(store, 'microphone'))
let speakerId = $state<string | null>(readDevicePreference(store, 'speaker'))
const speakerSelectable = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype

async function loadDevices() {
  const devices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices
  if (!devices) return
  const found = await devices.enumerateDevices().catch(() => [] as MediaDeviceInfo[])
  const of = (kind: MediaDeviceKind) =>
    found.filter((d) => d.kind === kind).map((d) => ({ deviceId: d.deviceId, label: d.label }))
  cameras = of('videoinput')
  microphones = of('audioinput')
  speakers = of('audiooutput')
}

function chooseDevice(kind: DeviceKind, deviceId: string) {
  if (!deviceId) return
  writeDevicePreference(store, kind, deviceId)
  if (kind === 'camera') cameraId = deviceId
  else if (kind === 'microphone') microphoneId = deviceId
  else speakerId = deviceId
  void meetingSession.setDevice(kind, deviceId)
}
</script>

<PageHeader
  crumbs={[{ label: workspace?.name ?? '' }, { label: t('nav') }]}
  title={t('title')}
  subtitle={screen === 'live' ? t('people_count', { n: meetingSession.tiles.length }) : null}
/>

<Page padding="board">
  {#if screen === 'loading'}
    <div class="loading" aria-busy="true">
      <Skeleton height="280px" />
      <Skeleton height="44px" />
    </div>
  {:else if screen === 'not_configured'}
    <EmptyState icon="plug" title={t('not_configured_title')} description={t('not_configured_desc')}>
      {#snippet actions()}
        <!--
          The two things an administrator types. Not translated and not paraphrased: a localised
          environment variable is a setting that does not exist, and a localised Compose command is
          a command that does not run.
        -->
        <div class="recipe">
          <span class="rlabel">{t('not_configured_var')}</span>
          <code>LIVEKIT_API_SECRET</code>
          <span class="rlabel">{t('not_configured_cmd')}</span>
          <code>docker compose --profile calls up -d</code>
        </div>
      {/snippet}
    </EmptyState>
  {:else if screen === 'insecure'}
    <EmptyState icon="lock" title={t('insecure_title')} description={t('insecure_desc')}>
      {#snippet actions()}
        <p class="hint">{t('insecure_hint')}</p>
      {/snippet}
    </EmptyState>
  {:else if screen === 'not_found'}
    <EmptyState icon="circle-x" title={t('not_found_title')} description={t('not_found_desc')} />
  {:else if screen === 'denied'}
    <!--
      A screen and not a toast. Re-granting a camera permission is three steps in a menu the reader
      has to find, and a message that disappears after four seconds cannot carry three steps.
    -->
    <EmptyState icon="triangle-alert" title={t('denied_title')} description={t('denied_desc')}>
      {#snippet actions()}
        <div class="steps">
          <ol>
            <li>{t('denied_step_1')}</li>
            <li>{t('denied_step_2')}</li>
            <li>{t('denied_step_3')}</li>
          </ol>
          <Button variant="secondary" onclick={retry}>{t('denied_retry')}</Button>
        </div>
      {/snippet}
    </EmptyState>
  {:else if screen === 'no_devices'}
    <EmptyState icon="video" title={t('no_devices_title')} description={t('no_devices_desc')}>
      {#snippet actions()}
        <Button
          variant="secondary"
          onclick={() =>
            void join({
              microphone: false,
              camera: false,
              cameraId: null,
              microphoneId: null,
              speakerId: null,
            })}
        >
          {t('join_to_listen')}
        </Button>
      {/snippet}
    </EmptyState>
  {:else if screen === 'connecting'}
    <div class="middle" role="status">
      <EmptyState icon="loader" title={t('connecting')} description={t('connecting_desc')} />
    </div>
  {:else if screen === 'failed'}
    <EmptyState icon="wifi-off" title={t('failed_title')} description={t('failed_desc')}>
      {#snippet actions()}
        <div class="steps">
          <p class="hint">{t('failed_hint')}</p>
          <Button variant="secondary" onclick={retry}>{t('common.retry')}</Button>
        </div>
      {/snippet}
    </EmptyState>
  {:else if screen === 'ended'}
    <EmptyState icon="circle-check" title={t('ended_title')} description={t('ended_desc')}>
      {#snippet actions()}
        <Button variant="secondary" href={`/${workspaceSlug}`}>{t('ended_back')}</Button>
      {/snippet}
    </EmptyState>
  {:else if screen === 'error'}
    <EmptyState icon="triangle-alert" title={t('error_title')}>
      {#snippet actions()}
        <Button variant="secondary" onclick={retry}>{t('common.retry')}</Button>
      {/snippet}
    </EmptyState>
  {:else if screen === 'prejoin'}
    <PreJoin
      {isDemo}
      {joining}
      onjoin={(choice) => void join(choice)}
      onmediafailure={(failure) => {
        mediaFailure = failure
      }}
    />
  {:else}
    <div class="room" class:withpanel={peopleOpen || chatOpen}>
      <div class="main">
        <Stage
          tiles={meetingSession.tiles}
          reconnecting={status === 'reconnecting'}
          onCopyLink={copyLink}
          {linkCopied}
        />
        <ControlBar
          micOn={meetingSession.micOn}
          cameraOn={meetingSession.cameraOn}
          sharing={meetingSession.sharing}
          {canShare}
          {peopleOpen}
          {chatOpen}
          onToggleMic={() => meetingSession.toggleMicrophone()}
          onToggleCamera={() => meetingSession.toggleCamera()}
          onToggleShare={() => meetingSession.toggleScreenShare()}
          onTogglePeople={() => {
            peopleOpen = !peopleOpen
            if (peopleOpen) chatOpen = false
          }}
          onToggleChat={() => {
            chatOpen = !chatOpen
            if (chatOpen) peopleOpen = false
          }}
          onDevices={() => {
            devicesOpen = true
          }}
          onLeave={() => void leave()}
        />
      </div>

      {#if peopleOpen}
        <ParticipantRail
          tiles={meetingSession.tiles}
          onClose={() => {
            peopleOpen = false
          }}
        />
      {:else if chatOpen}
        <ChatPanel
          messages={meetingSession.messages}
          onSend={(body) => meetingSession.send(body, myName)}
          onClose={() => {
            chatOpen = false
          }}
        />
      {/if}
    </div>
  {/if}
</Page>

<Dialog
  bind:open={devicesOpen}
  title={t('devices')}
  size="md"
  onOpenChange={(open) => {
    if (open) void loadDevices()
  }}
>
  <!--
    The same picker as the pre-join, in a dialog. Switching mid-call goes through LiveKit's
    `switchActiveDevice` rather than through a fresh `getUserMedia`, because republishing a track
    shows everybody else a black frame for as long as it takes to renegotiate.
  -->
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
</Dialog>

<style>
.loading {
  display: grid;
  gap: 12px;
}
.middle {
  display: grid;
  place-items: center;
  min-block-size: 240px;
}
.room {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.room.withpanel {
  grid-template-columns: minmax(0, 1fr) minmax(240px, 300px);
}
.main {
  display: grid;
  gap: 12px;
  min-inline-size: 0;
}
.recipe {
  display: grid;
  gap: 4px;
  justify-items: center;
  font-size: 12.5px;
}
.rlabel {
  color: var(--kern-ink-500);
}
.recipe code {
  font-family: var(--kern-font-mono);
  font-size: 12px;
  padding: 3px 8px;
  border-radius: var(--kern-r-md);
  background: var(--kern-surface-raised);
  border: 1px solid var(--kern-border-hairline);
  color: var(--kern-ink-900);
  /* A command wraps rather than pushing the page sideways in a narrow column. */
  overflow-wrap: anywhere;
}
.hint {
  margin: 0;
  max-inline-size: 420px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--kern-ink-500);
}
.steps {
  display: grid;
  gap: 10px;
  justify-items: center;
}
.steps ol {
  margin: 0;
  padding-inline-start: 20px;
  display: grid;
  gap: 4px;
  text-align: start;
  font-size: 13px;
  line-height: 1.55;
  color: var(--kern-ink-600);
  max-inline-size: 420px;
}

@media (max-width: 860px) {
  .room.withpanel {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
