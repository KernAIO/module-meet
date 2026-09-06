import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'
import { isConfigured, type MeetEnv } from '../env.js'

/** How long a join token lives. Short on purpose — see `mintJoinToken`. */
export const TOKEN_TTL_SECONDS = 600

/**
 * `RoomServiceClient` speaks HTTP; every shipped stack passes `LIVEKIT_URL` as `ws://livekit:7880`
 * because that is what the *browser* needs. Normalising here rather than changing the shipped value
 * is deliberate: `install.sh` writes a distribution file only when it is absent, so a variable an
 * existing instance already has is never re-read, and a value edited in the repository would reach
 * new installs only. The umbrella's CLAUDE.md records that whole class.
 */
export const httpUrl = (url: string) => url.replace(/^ws(s)?:\/\//, 'http$1://')

export const roomServiceClient = (env: MeetEnv) =>
  isConfigured(env)
    ? new RoomServiceClient(httpUrl(env.LIVEKIT_URL!), env.LIVEKIT_API_KEY!, env.LIVEKIT_API_SECRET!)
    : null

/**
 * Is the media server actually there?
 *
 * A real `listRooms()`, not a ping and not an inference from configuration. An administrator asking
 * why meetings do not work needs the two answers separated: a missing secret and an unreachable
 * container are different problems with different fixes, and a check that collapses them sends the
 * reader to the wrong one. Returns false rather than throwing — this feeds a status screen, and a
 * status screen that 500s tells the reader nothing.
 */
export async function isReachable(env: MeetEnv): Promise<boolean> {
  const client = roomServiceClient(env)
  if (!client) return false
  try {
    await client.listRooms()
    return true
  } catch {
    return false
  }
}

/**
 * Mint a join token for exactly one room and one person.
 *
 * **This function is the whole security boundary of the module.** A LiveKit token is a bearer
 * credential that the media server trusts completely: it never calls back to ask whether the grant
 * was a good idea. So every claim below is built from what the caller was *found* to be entitled to,
 * never from anything in the request — and the shape matters more than it looks:
 *
 * - `room` is one room name, decided by the caller's authorisation, so a token for a meeting the
 *   person may join cannot be replayed against a meeting they may not.
 * - `roomAdmin` and `roomCreate` are **absent**. `roomCreate` would let any member conjure a room
 *   Kern has no record of, which is exactly what `room.auto_create: false` in `livekit.yaml` exists
 *   to prevent; `roomAdmin` is the power to remove other people, and moderation is a Kern decision
 *   made against Kern's tables, not something delegated to whoever holds a token.
 * - `identity` is the Kern user id, so the participant list LiveKit reports can be joined back to
 *   real people and a webhook cannot be lied to about who was in the call.
 * - the TTL is ten minutes, and it is short **so that somebody removed mid-call cannot outlast their
 *   token**. Revocation in LiveKit is a live API call against a running room; expiry is the thing
 *   that holds when the API call fails or the room has already moved on.
 *
 * `name` is display text only. It never grants anything, so it is safe to take from the profile.
 *
 * **Async, and it has to be.** `AccessToken.toJwt()` returns a `Promise<string>` in
 * livekit-server-sdk 2.x. Casting it to a string compiles and hands the client a JSON-serialised
 * `{}` in the `token` field — a call that fails at the media server with no error anywhere in Kern.
 */
export async function mintJoinToken(args: {
  env: MeetEnv
  room: string
  userId: string
  displayName?: string | null
}): Promise<string> {
  if (!isConfigured(args.env)) throw new Error('LiveKit is not configured')
  const token = new AccessToken(args.env.LIVEKIT_API_KEY!, args.env.LIVEKIT_API_SECRET!, {
    identity: args.userId,
    name: args.displayName ?? undefined,
    ttl: TOKEN_TTL_SECONDS,
  })
  token.addGrant({
    roomJoin: true,
    room: args.room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })
  return await token.toJwt()
}
