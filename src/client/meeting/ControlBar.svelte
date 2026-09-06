<script lang="ts">
import { Button, IconButton } from '@kernhq/ui'
import { t } from '../i18n.js'

/**
 * Microphone, camera, screen, people, chat, devices, Leave.
 *
 * **The screen-share button is absent where the browser cannot share a screen**, rather than
 * present and dead. Safari on iOS has no `getDisplayMedia` at all, so on a phone the control would
 * open nothing — and on a bar this narrow it would also be taking room from a control that works.
 * `canShare` is a feature test made in `media.ts`, never a user-agent string.
 *
 * **Nothing here is disabled while it is working.** The browser blurs a focused element the moment
 * it becomes disabled and gives focus back to nobody, so a keyboard user who mutes themselves loses
 * their place on the page. Each handler holds a plain flag set in the same tick as the click —
 * which also stops the second click of a double-click, something `disabled` cannot do because the
 * attribute only reaches the button on the next render.
 */
interface Props {
  micOn: boolean
  cameraOn: boolean
  sharing: boolean
  canShare: boolean
  peopleOpen: boolean
  chatOpen: boolean
  onToggleMic: () => void | Promise<void>
  onToggleCamera: () => void | Promise<void>
  onToggleShare: () => void | Promise<void>
  onTogglePeople: () => void
  onToggleChat: () => void
  onDevices: () => void
  onLeave: () => void
}
let {
  micOn,
  cameraOn,
  sharing,
  canShare,
  peopleOpen,
  chatOpen,
  onToggleMic,
  onToggleCamera,
  onToggleShare,
  onTogglePeople,
  onToggleChat,
  onDevices,
  onLeave,
}: Props = $props()

let busy = $state<string | null>(null)

async function once(name: string, run: () => void | Promise<void>) {
  if (busy) return
  busy = name
  try {
    await run()
  } finally {
    busy = null
  }
}
</script>

<div class="bar" role="group" aria-label={t('title')}>
  <!--
    One glyph per control, with the state carried by tone and by the accessible name rather than by
    a second icon: the shared registry has `mic` and `video` and no struck-through pair, and adding
    two icons to the framework for this screen would be a platform change to make a button red.
    The danger tone is the convention every video product already uses for "you are muted".
  -->
  <IconButton
    icon="mic"
    size={34}
    variant={micOn ? 'secondary' : 'primary'}
    class={micOn ? '' : 'off'}
    label={micOn ? t('mic_mute') : t('mic_unmute')}
    aria-pressed={!micOn}
    aria-busy={busy === 'mic'}
    onclick={() => void once('mic', onToggleMic)}
  />
  <IconButton
    icon="video"
    size={34}
    variant={cameraOn ? 'secondary' : 'primary'}
    class={cameraOn ? '' : 'off'}
    label={cameraOn ? t('camera_stop') : t('camera_start')}
    aria-pressed={!cameraOn}
    aria-busy={busy === 'camera'}
    onclick={() => void once('camera', onToggleCamera)}
  />
  {#if canShare}
    <IconButton
      icon="monitor"
      size={34}
      variant={sharing ? 'primary' : 'secondary'}
      label={sharing ? t('share_stop') : t('share_start')}
      aria-pressed={sharing}
      aria-busy={busy === 'share'}
      onclick={() => void once('share', onToggleShare)}
    />
  {/if}

  <span class="gap"></span>

  <IconButton
    icon="users"
    size={34}
    variant="secondary"
    active={peopleOpen}
    label={t('people_toggle')}
    aria-pressed={peopleOpen}
    onclick={onTogglePeople}
  />
  <IconButton
    icon="message-square-text"
    size={34}
    variant="secondary"
    active={chatOpen}
    label={t('chat_toggle')}
    aria-pressed={chatOpen}
    onclick={onToggleChat}
  />
  <IconButton
    icon="sliders-vertical"
    size={34}
    variant="secondary"
    label={t('devices')}
    onclick={onDevices}
  />

  <Button variant="danger" icon="log-out" onclick={onLeave} data-testid="meet-leave">{t('leave')}</Button>
</div>

<style>
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--kern-r-2xl);
  border: 1px solid var(--kern-border);
  background: var(--kern-surface-raised);
}
.gap {
  flex: 1;
  min-inline-size: 4px;
}
/*
 * The muted and camera-off states. `primary` gives the button a filled ground; this recolours it to
 * the danger token so that "off" reads at a glance and still clears contrast in both themes.
 */
.bar :global(.off) {
  background: var(--kern-danger);
  border-color: var(--kern-danger);
  color: #fff;
}
</style>
