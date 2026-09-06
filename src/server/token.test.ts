import { TokenVerifier } from 'livekit-server-sdk'
import { describe, expect, it } from 'vitest'
import type { MeetEnv } from './env.js'
import { httpUrl, mintJoinToken, TOKEN_TTL_SECONDS } from './services/livekit.js'
import { livekitRoomName } from './services/meetings.js'

/**
 * The security proof of this module.
 *
 * A LiveKit token is a bearer credential the media server trusts completely — it never calls back to
 * ask whether the grant was a good idea. So everything that decides what somebody may do in a call
 * is settled here, in a string, at the moment it is minted, and this file reads that string back
 * rather than reading the code that wrote it.
 *
 * It asserts against the **decoded payload**, not against the object handed to `addGrant`, because
 * those are two different things and only one of them reaches LiveKit. Asserting on the argument
 * would pass just as happily if the SDK dropped a field, renamed one, or defaulted a permission the
 * caller never asked for.
 */

const SECRET = 'a-test-secret-long-enough-to-sign-with'
const env: MeetEnv = {
  LIVEKIT_URL: 'ws://livekit:7880',
  LIVEKIT_API_KEY: 'kern',
  LIVEKIT_API_SECRET: SECRET,
}

const WORKSPACE = '00000000-0000-4000-8000-00000000aa01'
const MEETING = '00000000-0000-4000-8000-00000000bb01'
const USER = '00000000-0000-4000-8000-00000000cc01'
const ROOM = livekitRoomName(WORKSPACE, MEETING)

/**
 * A LiveKit JWT's claims, as they actually arrive.
 *
 * `video` is where every capability lives, and the fields this module refuses to grant are simply
 * **absent** from it rather than present and false — which is why the assertions below check for
 * `undefined` and not for `false`.
 */
interface Claims {
  sub?: string
  name?: string
  iss?: string
  exp?: number
  nbf?: number
  iat?: number
  video?: Record<string, unknown>
}

/** The payload without checking the signature — what a client can read off its own token. */
const decode = (jwt: string): Claims =>
  JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString('utf8')) as Claims

const mint = () => mintJoinToken({ env, room: ROOM, userId: USER, displayName: 'Ada Lovelace' })

describe('the join token is a real token, signed with this instance’s secret', () => {
  it('verifies against the configured key and secret', async () => {
    // `mintJoinToken` returning something *shaped* like a token is not the claim being made. The
    // claim is that LiveKit will accept it, and the verifier is the same code LiveKit runs.
    const claims = (await new TokenVerifier(env.LIVEKIT_API_KEY!, SECRET).verify(await mint())) as Claims
    expect(claims.iss).toBe('kern')
  })

  it('is refused by a verifier holding a different secret', async () => {
    // The guard on the guard: without this, a mint that produced an unsigned or wrongly signed
    // string would still pass the test above if the verifier were lenient. It is not.
    await expect(
      new TokenVerifier(env.LIVEKIT_API_KEY!, 'a-different-secret-entirely-here').verify(await mint()),
    ).rejects.toThrow()
  })

  it('is a string, not a promise wearing a string’s type', async () => {
    /*
     * `AccessToken.toJwt()` returns `Promise<string>` in livekit-server-sdk 2.x. A cast rather than
     * an `await` compiles, type-checks, passes lint, and puts a JSON-serialised `{}` in the `token`
     * field of the response — a call that fails at the media server with nothing wrong anywhere in
     * Kern. This module shipped that cast before the tests existed.
     */
    const jwt = await mint()
    expect(typeof jwt).toBe('string')
    expect(jwt.split('.')).toHaveLength(3)
  })
})

describe('the grant is one room, and only what being in it needs', () => {
  it('names the single room the caller was admitted to, and nothing else', async () => {
    const { video } = decode(await mint())
    expect(video?.room).toBe(ROOM)
    // A room name is the entire scope of a token, so a wildcard or a second room would make one
    // token a key to meetings the caller was never authorised for.
    expect(video?.room).toBe(`kern-${WORKSPACE}-${MEETING}`)
    expect(video?.roomJoin).toBe(true)
  })

  it('grants publish, subscribe and data, which is what being in a call is', async () => {
    const { video } = decode(await mint())
    expect({
      canPublish: video?.canPublish,
      canSubscribe: video?.canSubscribe,
      canPublishData: video?.canPublishData,
    }).toEqual({ canPublish: true, canSubscribe: true, canPublishData: true })
  })

  it('carries neither roomAdmin nor roomCreate', async () => {
    /*
     * The two that matter, and the reason this file exists.
     *
     * `roomCreate` would let anybody holding a token conjure a room Kern has no record of, which is
     * exactly what `room.auto_create: false` in `livekit.yaml` exists to prevent. `roomAdmin` is the
     * power to mute and remove other people — a Kern decision, made against Kern's tables, never
     * delegated to whoever is holding a bearer string.
     *
     * Absent, not false: a `false` would be equally safe today and would mean somebody had written
     * the field, which is one edit away from writing `true`.
     */
    const { video } = decode(await mint())
    expect(video?.roomAdmin).toBeUndefined()
    expect(video?.roomCreate).toBeUndefined()
    expect(Object.keys(video ?? {}).sort()).toEqual([
      'canPublish',
      'canPublishData',
      'canSubscribe',
      'room',
      'roomJoin',
    ])
  })

  it('never grants ingress, egress or the list of every room on the instance', async () => {
    // Named individually as well as by the key-set assertion above, because these are the grants a
    // future edit is most likely to add "just to make something work".
    const { video } = decode(await mint())
    for (const grant of ['roomList', 'roomRecord', 'ingressAdmin', 'recorder', 'hidden'])
      expect({ grant, value: video?.[grant] }).toEqual({ grant, value: undefined })
  })
})

describe('the token expires in ten minutes, from now', () => {
  it('lives exactly TOKEN_TTL_SECONDS', async () => {
    /*
     * **Measured as `exp - nbf`, and that is not a typo.** livekit-server-sdk 2.18.0 emits `nbf`
     * and no `iat` at all — checked by decoding a token rather than by reading the SDK — so a test
     * asserting `exp - iat` would be comparing a number with `undefined` and would have to be
     * written to pass anyway. `nbf` is the moment the token becomes usable, so `exp - nbf` is its
     * whole life.
     */
    const claims = decode(await mint())
    expect(claims.iat, 'this SDK emits nbf instead; see the comment above').toBeUndefined()
    expect(claims.exp! - claims.nbf!).toBe(TOKEN_TTL_SECONDS)
    expect(TOKEN_TTL_SECONDS, 'ten minutes — short so somebody removed mid-call cannot outlast it').toBe(600)
  })

  it('starts now rather than at some fixed point in time', async () => {
    // Ten minutes is only short if it begins when the call does. A TTL measured from a constant
    // would satisfy the assertion above and hand out a token good for a decade.
    const before = Math.floor(Date.now() / 1000)
    const claims = decode(await mint())
    expect(claims.nbf).toBeGreaterThanOrEqual(before - 2)
    expect(claims.nbf).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 2)
  })
})

describe('the token says who its holder is', () => {
  it('fixes the identity to the Kern user id', async () => {
    /*
     * LiveKit reports this string back in every webhook and in every participant list, so it is what
     * joins a media session to a person. Taking it from the request rather than from the
     * authenticated principal would let somebody attend a meeting under a colleague's name — and the
     * attendance table would agree with them.
     */
    const claims = decode(await mint())
    expect(claims.sub).toBe(USER)
  })

  it('carries the display name as a name and never as a grant', async () => {
    // `name` is text on a tile. It is safe to take from a profile precisely because nothing reads
    // it to decide anything.
    const claims = decode(await mint())
    expect(claims.name).toBe('Ada Lovelace')
    expect(claims.video?.name, 'a display name must not be inside the grant').toBeUndefined()
  })

  it('mints for the user it was asked about, not for the last one', async () => {
    const other = '00000000-0000-4000-8000-00000000cc02'
    const claims = decode(await mintJoinToken({ env, room: ROOM, userId: other, displayName: null }))
    expect(claims.sub).toBe(other)
    expect(claims.name, 'no display name given, so none is claimed').toBeUndefined()
  })
})

describe('an instance with no LiveKit mints nothing', () => {
  it('refuses rather than signing with an empty secret', async () => {
    /*
     * The default state of every Kern install: the `calls` compose profile is not started, so
     * nothing is configured. A signer that accepted `''` would produce a token any reader of the
     * shipped compose file could forge.
     */
    for (const broken of [
      { ...env, LIVEKIT_API_SECRET: undefined },
      { ...env, LIVEKIT_API_KEY: undefined },
      { ...env, LIVEKIT_URL: undefined },
      {},
    ] satisfies MeetEnv[])
      await expect(
        mintJoinToken({ env: broken, room: ROOM, userId: USER }),
        JSON.stringify(broken),
      ).rejects.toThrow(/not configured/)
  })
})

describe('the server address is normalised, and the browser’s is not touched', () => {
  it('turns the ws scheme every shipped stack passes into the http one RoomServiceClient needs', () => {
    // `LIVEKIT_URL` is `ws://livekit:7880` in all three compose files because that is what a browser
    // needs. `install.sh` writes a distribution value only when it is absent, so an existing
    // instance would never re-read a changed one — which is why this is normalised in code.
    expect(httpUrl('ws://livekit:7880')).toBe('http://livekit:7880')
    expect(httpUrl('wss://example.test/livekit')).toBe('https://example.test/livekit')
    expect(httpUrl('http://livekit:7880'), 'already http, left alone').toBe('http://livekit:7880')
  })
})
