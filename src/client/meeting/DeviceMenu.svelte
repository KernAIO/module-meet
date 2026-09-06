<script lang="ts">
import { Field, Select } from '@kernhq/ui'
import { t } from '../i18n.js'
import type { DeviceKind, DeviceOption } from './media.js'

/**
 * Which camera, which microphone, which speaker.
 *
 * One component used in two places — inline under the pre-join preview, and in a dialog opened from
 * the control bar — because the choice is the same choice, and a second copy of it is a second
 * place for the labels and the fallbacks to drift.
 *
 * The speaker picker is **absent, not disabled**, where the browser has no
 * `setSinkId`: Safari plays through whatever the system is set to and offers no way to change it,
 * so a select there would be a control that reads back the value you did not choose. The sentence
 * that replaces it says why, which is the whole difference between an absent control and a missing
 * one.
 */
interface Props {
  cameras: DeviceOption[]
  microphones: DeviceOption[]
  speakers: DeviceOption[]
  cameraId: string | null
  microphoneId: string | null
  speakerId: string | null
  /** False on a browser with no output selection at all. */
  speakerSelectable: boolean
  onchange: (kind: DeviceKind, deviceId: string) => void
}
let {
  cameras,
  microphones,
  speakers,
  cameraId,
  microphoneId,
  speakerId,
  speakerSelectable,
  onchange,
}: Props = $props()

/**
 * A device with no label is one the browser will not name until permission is granted, which is
 * every device on a first visit. Numbering them is better than three empty rows: somebody can still
 * tell them apart, and the labels arrive the moment the camera does.
 */
const options = (devices: DeviceOption[], kindLabel: string) =>
  devices.map((device, index) => ({
    value: device.deviceId,
    label: device.label.trim() || `${kindLabel} ${index + 1}`,
  }))

const empty = [{ value: '', label: t('device_none'), disabled: true }]
</script>

<div class="devices">
  <Field label={t('device_camera')}>
    {#snippet children(id)}
      <Select
        {id}
        size="sm"
        ariaLabel={t('device_camera')}
        value={cameraId ?? ''}
        options={cameras.length ? options(cameras, t('device_camera')) : empty}
        onValueChange={(v) => onchange('camera', v)}
      />
    {/snippet}
  </Field>

  <Field label={t('device_microphone')}>
    {#snippet children(id)}
      <Select
        {id}
        size="sm"
        ariaLabel={t('device_microphone')}
        value={microphoneId ?? ''}
        options={microphones.length ? options(microphones, t('device_microphone')) : empty}
        onValueChange={(v) => onchange('microphone', v)}
      />
    {/snippet}
  </Field>

  {#if speakerSelectable}
    <Field label={t('device_speaker')}>
      {#snippet children(id)}
        <Select
          {id}
          size="sm"
          ariaLabel={t('device_speaker')}
          value={speakerId ?? ''}
          options={speakers.length ? options(speakers, t('device_speaker')) : empty}
          onValueChange={(v) => onchange('speaker', v)}
        />
      {/snippet}
    </Field>
  {:else}
    <p class="note">{t('device_speaker_fixed')}</p>
  {/if}
</div>

<style>
.devices {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  align-items: end;
}
.note {
  margin: 0;
  align-self: center;
  font-size: 12.5px;
  line-height: 1.5;
  /* A colour rather than opacity: a faded row is unreadable whatever token it names. */
  color: var(--kern-ink-500);
}
</style>
