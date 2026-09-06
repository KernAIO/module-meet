/**
 * Who is on the big tile, and who is in the strip.
 *
 * Pure, so the rule can be tested: the stage is the one decision in this screen that is wrong in a
 * way nobody reports — it just quietly shows the person who is not talking.
 */

/**
 * One person as the screen needs them.
 *
 * `attach`/`detach` are closures over whatever is producing the picture rather than the track
 * itself. A `$state` array deep-proxies the plain objects inside it, and handing a class instance
 * from another package through that proxy is a class of bug nobody wants to debug at 3am; a
 * function comes back out of a proxy as itself.
 *
 * `null` for both means there is nothing to show, and `placeholder` says which sentence to draw in
 * its place — never an empty square, which reads as a broken feature rather than a closed camera.
 */
export interface Tile {
  id: string
  name: string
  isLocal: boolean
  speaking: boolean
  micOn: boolean
  cameraOn: boolean
  sharing: boolean
  placeholder: 'camera_off' | 'demo'
  attach: ((el: HTMLVideoElement) => void) | null
  detach: ((el: HTMLVideoElement) => void) | null
}

export interface StageLayout {
  /** The large tile. Null only when there is nobody at all, which the screen answers separately. */
  feature: Tile | null
  /** Everybody else, in a strip. Includes the local tile unless it is the feature. */
  rail: Tile[]
}

/**
 * A share wins, then whoever is speaking, then the first remote person, then you.
 *
 * "Then you" last is the part that reads as an omission and is not: a meeting you are alone in
 * should show *you*, and a meeting with somebody else in it should show them — putting yourself on
 * the stage while a colleague talks is the single most common complaint about a video grid.
 */
export function stageLayout(tiles: readonly Tile[]): StageLayout {
  if (tiles.length === 0) return { feature: null, rail: [] }
  const feature =
    tiles.find((t) => t.sharing) ??
    tiles.find((t) => t.speaking && !t.isLocal) ??
    tiles.find((t) => !t.isLocal) ??
    tiles[0]
  if (!feature) return { feature: null, rail: [] }
  return { feature, rail: tiles.filter((t) => t.id !== feature.id) }
}

/** A name to draw when the token carried none — an identity is a uuid, which is not a name. */
export function displayName(name: string | undefined, fallback: string): string {
  const trimmed = (name ?? '').trim()
  return trimmed.length > 0 ? trimmed : fallback
}
