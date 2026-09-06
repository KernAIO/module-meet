import { describe, expect, it } from 'vitest'
import {
  canShareScreen,
  classifyMediaError,
  type DeviceOption,
  pickDevice,
  readDevicePreference,
  writeDevicePreference,
} from './media.js'

/** What a browser actually throws, by name. `DOMException` is not guaranteed here, so this is it. */
const thrown = (name: string) => Object.assign(new Error(name), { name })

describe('classifyMediaError', () => {
  it('blames the page, not the person, when the context is insecure', () => {
    /*
     * The whole reason this function takes the flag. Kern supports an IP-only HTTP install
     * (`ACME_EMAIL=internal`), and a browser there refuses `getUserMedia` before the module is
     * asked — throwing the *same* `NotAllowedError` it throws when somebody presses Block. Reading
     * the error alone sends that person to a browser settings page where camera access is already
     * allowed, to fix a permission they never denied.
     */
    expect(classifyMediaError(thrown('NotAllowedError'), false)).toBe('insecure')
    expect(classifyMediaError(thrown('NotFoundError'), false)).toBe('insecure')
    expect(classifyMediaError(undefined, false)).toBe('insecure')
  })

  it('reads the browser‘s own names on a secure page', () => {
    expect(classifyMediaError(thrown('NotAllowedError'), true)).toBe('permission_denied')
    expect(classifyMediaError(thrown('SecurityError'), true)).toBe('permission_denied')
    expect(classifyMediaError(thrown('NotFoundError'), true)).toBe('no_devices')
    expect(classifyMediaError(thrown('OverconstrainedError'), true)).toBe('no_devices')
    expect(classifyMediaError(thrown('NotReadableError'), true)).toBe('in_use')
    expect(classifyMediaError(thrown('AbortError'), true)).toBe('in_use')
  })

  it('does not guess at an error it has never met', () => {
    expect(classifyMediaError(thrown('SomethingNewError'), true)).toBe('unknown')
    expect(classifyMediaError('a string', true)).toBe('unknown')
    expect(classifyMediaError(null, true)).toBe('unknown')
  })
})

describe('canShareScreen', () => {
  /**
   * Safari on iOS has no `getDisplayMedia` at all, so the control bar leaves the button out rather
   * than offering one that opens nothing. A feature test, never a user-agent string: the day the
   * API arrives there, the button appears without anybody editing a list of browsers.
   */
  it('is false where the browser has no getDisplayMedia', () => {
    expect(canShareScreen({ getUserMedia: () => {} })).toBe(false)
    expect(canShareScreen(undefined)).toBe(false)
    expect(canShareScreen(null)).toBe(false)
  })

  it('is true where it has one', () => {
    expect(canShareScreen({ getDisplayMedia: () => {} })).toBe(true)
  })
})

describe('device preferences', () => {
  const store = () => {
    const map = new Map<string, string>()
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
      map,
    }
  }

  it('keeps a camera choice apart from a microphone choice', () => {
    const s = store()
    writeDevicePreference(s, 'camera', 'cam-1')
    writeDevicePreference(s, 'microphone', 'mic-1')
    expect(readDevicePreference(s, 'camera')).toBe('cam-1')
    expect(readDevicePreference(s, 'microphone')).toBe('mic-1')
    expect(readDevicePreference(s, 'speaker')).toBeNull()
  })

  /**
   * A browser with site data blocked throws on the accessor itself, not on the value. A device
   * preference is the last thing that should stop a meeting opening, so both directions swallow it.
   */
  it('survives a storage that throws', () => {
    const hostile = {
      getItem() {
        throw new Error('blocked')
      },
      setItem() {
        throw new Error('blocked')
      },
    }
    expect(readDevicePreference(hostile, 'camera')).toBeNull()
    expect(() => writeDevicePreference(hostile, 'camera', 'cam-1')).not.toThrow()
    expect(readDevicePreference(null, 'camera')).toBeNull()
  })
})

describe('pickDevice', () => {
  const devices: DeviceOption[] = [
    { deviceId: 'cam-1', label: 'FaceTime HD' },
    { deviceId: 'cam-2', label: 'Logitech' },
  ]

  it('keeps the remembered device when it is still plugged in', () => {
    expect(pickDevice(devices, 'cam-2')).toBe('cam-2')
  })

  /**
   * Somebody who chose a headset at the office and opened Kern at home. Without the fallback the
   * constraint fails with `OverconstrainedError`, which the screen would read as "no camera found"
   * — a true sentence about the wrong camera.
   */
  it('falls back to the first when the remembered one is gone', () => {
    expect(pickDevice(devices, 'cam-gone')).toBe('cam-1')
    expect(pickDevice(devices, null)).toBe('cam-1')
  })

  it('answers null when there is nothing to pick', () => {
    expect(pickDevice([], 'cam-1')).toBeNull()
  })
})
