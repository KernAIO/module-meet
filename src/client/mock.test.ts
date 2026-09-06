import { describe, expect, it } from 'vitest'
import { errorCode } from './meeting/connection.js'
import { createMockMeetApi, MOCK_MEETING, MOCK_MEETING_ID, mockMessages, mockTiles } from './mock.js'

/**
 * The demo has to be honest, because `dev:mock` is the environment the product is shown in and the
 * one `ux.spec.ts` sweeps. A mock that models something the server cannot produce certifies a
 * screen nobody can reach; a mock that draws an empty grid teaches a stranger the feature is broken.
 */
describe('the demo meeting', () => {
  const api = createMockMeetApi()

  it('opens for its own id and 404s for anything else', async () => {
    await expect(api.meetings.join({ meetingId: MOCK_MEETING_ID })).resolves.toMatchObject({
      meeting: { id: MOCK_MEETING_ID },
    })
    // Not FORBIDDEN. A meeting in another workspace and a meeting that never existed answer the
    // same way, because 403 would tell a caller that an id they guessed exists somewhere.
    const refused = await api.meetings
      .join({ meetingId: '01920000-0000-7000-8000-000000000999' })
      .catch((error: unknown) => error)
    expect(errorCode(refused)).toBe('NOT_FOUND')
  })

  it('reports a configured instance, so the demo shows the meeting rather than the setup screen', async () => {
    await expect(api.config.get()).resolves.toMatchObject({ configured: true })
  })

  it('never claims a real media server', async () => {
    const config = await api.config.get()
    // `.invalid` is reserved by RFC 2606 and resolves nowhere, so nothing in the demo can be
    // mistaken for an address somebody should try.
    expect(config.mediaUrl).toContain('.invalid')
  })

  it('has a fixed start time, so two sweeps render the same pixels', () => {
    expect(MOCK_MEETING.startedAt).toBe('2026-09-06T09:00:00.000Z')
    expect(MOCK_MEETING.endedAt).toBeNull()
  })
})

describe('the demo fixtures', () => {
  const tiles = mockTiles('You')

  /**
   * The whole point. A tile with no picture and no sentence is indistinguishable from a tile that
   * failed to load, and the sweep would certify it.
   */
  it('attaches no video at all, and says why on every tile', () => {
    expect(tiles.every((tile) => tile.attach === null && tile.detach === null)).toBe(true)
    expect(tiles.every((tile) => tile.placeholder === 'demo')).toBe(true)
  })

  it('puts you first and names you as the local participant', () => {
    expect(tiles[0]?.isLocal).toBe(true)
    expect(tiles[0]?.name).toBe('You')
    expect(tiles.filter((tile) => tile.isLocal)).toHaveLength(1)
  })

  /** So the stage's speaker rule and the muted badge are both visible rather than merely written. */
  it('shows a speaker and a muted person', () => {
    expect(tiles.some((tile) => tile.speaking && !tile.isLocal)).toBe(true)
    expect(tiles.some((tile) => !tile.micOn)).toBe(true)
  })

  it('gives the chat panel both sides of a conversation', () => {
    const messages = mockMessages()
    expect(messages.some((line) => line.mine)).toBe(true)
    expect(messages.some((line) => !line.mine)).toBe(true)
  })
})
