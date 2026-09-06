import { session } from '@kernhq/ui'
import { MODULE_ID, meetPermissions } from '../contract/index.js'

/**
 * What this module lets somebody do.
 *
 * **Derived from the contract, never re-typed.** `key()` throws at import if a name is not declared,
 * which is the whole point: a hand-copied permission string type-checks perfectly while being wrong,
 * and a wrong one silently hides a control or offers one the server refuses.
 *
 * Hide what a person may never do; disable — with a reason — what they cannot do right now. The
 * server checks again on every call regardless; this only stops the interface offering a door that
 * will not open.
 */
const key = (suffix: string) => {
  const found = meetPermissions.find((p) => p.key === `${MODULE_ID}.${suffix}`)
  if (!found) throw new Error(`${MODULE_ID}: no permission declared for ${MODULE_ID}.${suffix}`)
  return found.key
}

export const MEET_PERMISSIONS = {
  /** Being in a meeting at all — the key `meetings.join` and `config.get` ask for. */
  join: key('call.join'),
  /** Opening one that did not exist a moment ago, which is what `meetings.start` asks for. */
  start: key('call.start'),
} as const

export type MeetPermission = keyof typeof MEET_PERMISSIONS

export function canMeet(permission: MeetPermission): boolean {
  return session.can(MEET_PERMISSIONS[permission])
}
