import { describe, expect, it } from 'vitest'
import { displayName, stageLayout, type Tile } from './tiles.js'

const tile = (id: string, over: Partial<Tile> = {}): Tile => ({
  id,
  name: id,
  isLocal: false,
  speaking: false,
  micOn: true,
  cameraOn: true,
  sharing: false,
  placeholder: 'camera_off',
  attach: null,
  detach: null,
  ...over,
})

/**
 * The stage rule is tested because it fails silently: a grid showing the person who is *not*
 * talking looks exactly like a grid that is working, and nobody files a bug about it.
 */
describe('stageLayout', () => {
  it('gives the big tile to a screen share, whoever is talking', () => {
    const tiles = [tile('me', { isLocal: true }), tile('a', { speaking: true }), tile('b', { sharing: true })]
    expect(stageLayout(tiles).feature?.id).toBe('b')
    expect(stageLayout(tiles).rail.map((t) => t.id)).toEqual(['me', 'a'])
  })

  it('gives it to whoever is speaking when nobody is sharing', () => {
    const tiles = [tile('me', { isLocal: true }), tile('a'), tile('b', { speaking: true })]
    expect(stageLayout(tiles).feature?.id).toBe('b')
  })

  /**
   * Your own tile is last, and that reads as an omission until you have used a call: putting
   * yourself on the stage while a colleague talks is the single most common complaint about a video
   * grid, and hearing your own name is not a reason to look at your own face.
   */
  it('prefers somebody else over you when nobody is speaking', () => {
    const tiles = [tile('me', { isLocal: true, speaking: true }), tile('a')]
    expect(stageLayout(tiles).feature?.id).toBe('a')
  })

  it('shows you when you are the only one there', () => {
    const tiles = [tile('me', { isLocal: true })]
    expect(stageLayout(tiles).feature?.id).toBe('me')
    expect(stageLayout(tiles).rail).toEqual([])
  })

  it('has nothing to show before anybody has connected', () => {
    expect(stageLayout([])).toEqual({ feature: null, rail: [] })
  })

  it('never draws the same person twice', () => {
    const tiles = [tile('me', { isLocal: true }), tile('a', { speaking: true })]
    const { feature, rail } = stageLayout(tiles)
    expect(rail.map((t) => t.id)).not.toContain(feature?.id)
    expect(rail.length + 1).toBe(tiles.length)
  })
})

describe('displayName', () => {
  /** An identity is a uuid. Drawing one under a face is worse than drawing nothing. */
  it('falls back when the token carried no name', () => {
    expect(displayName(undefined, 'You')).toBe('You')
    expect(displayName('   ', 'You')).toBe('You')
    expect(displayName('Dan Brekke', 'You')).toBe('Dan Brekke')
  })
})
