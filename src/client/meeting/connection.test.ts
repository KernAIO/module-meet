import { describe, expect, it } from 'vitest'
import { classifyConnectError, errorCode, meetingLink } from './connection.js'

describe('classifyConnectError', () => {
  /**
   * A refusal is the server saying no, and no amount of retrying fixes it. Everything else a
   * connection attempt can produce — a timeout, a socket that never opened, an ICE negotiation that
   * never completed — is the same fact to the person in front of the screen: the network between
   * them and the media server did not carry a call.
   */
  it('separates a refused token from a blocked network', () => {
    expect(classifyConnectError({ name: 'ConnectionError', status: 401 })).toBe('refused')
    expect(classifyConnectError({ name: 'ConnectionError', status: 403 })).toBe('refused')
    expect(classifyConnectError({ name: 'ConnectionError', status: 503 })).toBe('blocked')
    expect(classifyConnectError({ name: 'ConnectionError' })).toBe('blocked')
  })

  it('does not claim to know what it has not seen', () => {
    expect(classifyConnectError(new Error('Failed to fetch dynamically imported module'))).toBe('unknown')
    expect(classifyConnectError(null)).toBe('unknown')
    expect(classifyConnectError('nope')).toBe('unknown')
  })
})

describe('errorCode', () => {
  /** oRPC puts it on the error; the in-memory mock does the same, so the demo reaches the branch. */
  it('reads the code off either shape', () => {
    expect(errorCode({ code: 'NOT_FOUND' })).toBe('NOT_FOUND')
    expect(errorCode({ data: { code: 'UNAVAILABLE' } })).toBe('UNAVAILABLE')
    expect(errorCode({})).toBeNull()
    expect(errorCode(undefined)).toBeNull()
  })
})

describe('meetingLink', () => {
  it('is the address somebody else can open', () => {
    expect(meetingLink('https://kern.example.com', 'northstar', 'abc')).toBe(
      'https://kern.example.com/northstar/meet/m/abc',
    )
  })

  it('does not double the slash on an origin that has one', () => {
    expect(meetingLink('https://kern.example.com/', 'northstar', 'abc')).toBe(
      'https://kern.example.com/northstar/meet/m/abc',
    )
  })

  /**
   * Built rather than copied from `location.href`, so a query string somebody arrived with is never
   * handed on. `?join=1` means "I have already agreed", and an invitation carrying it would put a
   * stranger's camera on before they had seen the door.
   */
  it('carries no query string', () => {
    expect(meetingLink('https://kern.example.com', 'northstar', 'abc')).not.toContain('?')
  })
})
