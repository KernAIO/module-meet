/**
 * Reading a browser's refusal, and remembering which camera somebody chose.
 *
 * Pure and string-free on purpose: a `.svelte` file cannot be unit-tested in this package, so
 * everything here that has a right and a wrong answer lives in a plain module the suite can load.
 * Nothing in this file imports `livekit-client` — the decisions below are about the browser, and
 * they are made before any SDK is asked for anything.
 */

/**
 * Why there is no camera, in the terms a screen has something to say about.
 *
 * `insecure` is the one that matters and the one a naive mapping gets wrong. On a page served over
 * plain HTTP a browser refuses `getUserMedia` before Kern is asked, and what it throws is a bare
 * `NotAllowedError` — indistinguishable from the user pressing Block. Kern supports an IP-only HTTP
 * install (`ACME_EMAIL=internal`), so that is a real deployment rather than a mistake, and telling
 * somebody they denied a permission they were never offered sends them to a settings page that
 * cannot help. The secure-context flag is therefore an *input* to this function rather than a
 * separate check somewhere else: the answer for an insecure page is `insecure` whatever was thrown.
 */
export type MediaFailure = 'insecure' | 'permission_denied' | 'no_devices' | 'in_use' | 'unknown'

/** The name a DOMException carries, without asserting the environment has DOMException at all. */
const nameOf = (error: unknown): string => {
  if (error && typeof error === 'object' && 'name' in error) {
    const name = (error as { name?: unknown }).name
    if (typeof name === 'string') return name
  }
  return ''
}

export function classifyMediaError(error: unknown, secureContext: boolean): MediaFailure {
  if (!secureContext) return 'insecure'
  switch (nameOf(error)) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'permission_denied'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'no_devices'
    case 'NotReadableError':
    case 'AbortError':
      return 'in_use'
    default:
      return 'unknown'
  }
}

/**
 * Whether this browser can capture a screen at all.
 *
 * A **feature test, never a user-agent test**: Safari on iOS has no `getDisplayMedia`, and so does
 * anything else that has not implemented it. The control bar leaves the button out entirely on the
 * strength of this — absent rather than present and dead, because a button that cannot do its job
 * is a promise the interface does not keep, and on a phone it is also the widest control in a row
 * that has no room to spare.
 */
export function canShareScreen(devices: unknown): boolean {
  if (!devices || typeof devices !== 'object') return false
  return typeof (devices as { getDisplayMedia?: unknown }).getDisplayMedia === 'function'
}

export type DeviceKind = 'camera' | 'microphone' | 'speaker'

/** One key per kind, so a camera choice cannot be read back as a microphone choice. */
const STORAGE_KEY: Record<DeviceKind, string> = {
  camera: 'kern.meet.camera',
  microphone: 'kern.meet.microphone',
  speaker: 'kern.meet.speaker',
}

/** The slice of `Storage` this needs, so a test can hand it a plain object. */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * What somebody chose last time, or null for "whatever the system picks".
 *
 * Every read is wrapped: a browser with site data blocked throws on the *accessor*, not on the
 * value, and a device preference is the last thing that should stop a meeting from opening.
 */
export function readDevicePreference(store: KeyValueStore | null, kind: DeviceKind): string | null {
  try {
    const value = store?.getItem(STORAGE_KEY[kind])
    return value ? value : null
  } catch {
    return null
  }
}

export function writeDevicePreference(store: KeyValueStore | null, kind: DeviceKind, deviceId: string) {
  try {
    store?.setItem(STORAGE_KEY[kind], deviceId)
  } catch {
    // A preference nobody could save is a preference nobody notices; a throw here would be a
    // meeting that will not open because a browser is in private mode.
  }
}

/** What `enumerateDevices` hands back, as thinly as a picker needs it. */
export interface DeviceOption {
  deviceId: string
  label: string
}

/**
 * The device to actually use: the remembered one if it is still plugged in, otherwise the first.
 *
 * Falling back rather than failing is the whole point — somebody who chose a headset at the office
 * and opened Kern at home would otherwise meet `OverconstrainedError`, which reads as "no camera
 * found" and is really "the camera you named last week is not here".
 */
export function pickDevice(devices: readonly DeviceOption[], preferred: string | null): string | null {
  if (devices.length === 0) return null
  if (preferred && devices.some((d) => d.deviceId === preferred)) return preferred
  return devices[0]?.deviceId ?? null
}
