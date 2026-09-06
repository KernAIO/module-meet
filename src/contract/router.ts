import { baseContract } from '@kernhq/contracts'
import { z } from 'zod'
import { Meeting, ObjectRef, ws } from './models.js'

/**
 * The oRPC contract: every procedure this module promises, as data.
 *
 * A procedure declared here and not implemented in the router is a lie that compiles — it
 * type-checks perfectly and 404s at runtime — so an entry arrives in the same commit as the handler
 * that answers it. `module.test.ts` walks this object and the router together and fails on either
 * side of that.
 *
 * Two shapes are not stylistic, and getting either wrong is silent:
 *
 * - **`baseContract`, not a bare `oc`.** It carries the shared error vocabulary every Kern client
 *   already knows how to read, so a `NOT_FOUND` from here arrives typed rather than as a bare 500.
 * - **`ws.extend({ … })`, never `z.object({ workspaceId: ws })`.** `ws` is already
 *   `{ workspaceId }`, so the second nests one inside the other — and `workspaceScoped` reads
 *   `input.workspaceId` expecting a string, finds an object, and refuses every call with
 *   "workspaceId required".
 */

/** One tag for the whole module, so the generated OpenAPI groups these three together. */
const t = ['meet'] as const

/**
 * Is this instance able to hold a meeting at all, and where would the browser connect?
 *
 * Deliberately **outside** the `calls` capability. An administrator whose meetings do not work has
 * to be able to find out why, and a diagnostic gated on the feature it diagnoses is no diagnostic.
 * This is also why no disabled button needs to exist anywhere in this module: a screen asks this and
 * says the true reason.
 *
 * It still carries workspace membership and `meet.call.join`, which is the widest of this module's
 * three keys. Only the *capability* is lifted — the answer names the instance's media server, so
 * "no gate at all" would be a different decision than the one being made here.
 *
 * `configured` and `reachable` are separate answers on purpose. A missing `LIVEKIT_API_SECRET` and a
 * container that is not running are different problems with different fixes, and one boolean would
 * send the reader to the wrong one.
 */
const configGet = baseContract
  .route({ method: 'GET', path: '/config', tags: t })
  .input(ws)
  .output(
    z.object({
      configured: z.boolean(),
      /** The address a *browser* connects to. Null when nothing is configured. */
      mediaUrl: z.string().nullable(),
      reachable: z.boolean(),
      maxParticipants: z.number().int().min(1),
    }),
  )

/** The token and everything a client needs to open the connection with it. */
const Joined = z.object({
  meeting: Meeting,
  token: z.string().min(1),
  mediaUrl: z.string().min(1),
  /** Seconds. The client should rejoin rather than assume a token lasts a meeting. */
  expiresIn: z.number().int().positive(),
})

/**
 * Start an ad-hoc meeting and be in it.
 *
 * Returns the same shape as `join` because starting is joining a meeting that did not exist a moment
 * ago — and, more importantly, because the token still comes from one place. See `join`.
 */
const meetingsStart = baseContract
  .route({ method: 'POST', path: '/meetings', tags: t })
  .input(
    ws.extend({
      title: z.string().max(200).nullish(),
      /** Attaches the meeting to a chat conversation, an issue, or anything else. */
      object: ObjectRef.nullish(),
    }),
  )
  .output(Joined)

/**
 * Join an existing meeting.
 *
 * **This is the only place in Kern that a LiveKit token is minted**, and every other entry point —
 * starting, answering a call, walking into a room, joining a huddle from a channel — delegates here
 * rather than minting its own. One place to authorise means one place to get it wrong, and one place
 * to read when asking whether a grant is right.
 */
const meetingsJoin = baseContract
  .route({ method: 'POST', path: '/meetings/{meetingId}/join', tags: t })
  .input(ws.extend({ meetingId: z.uuid() }))
  .output(Joined)

export const meetContract = {
  config: { get: configGet },
  meetings: { start: meetingsStart, join: meetingsJoin },
}
export type MeetContract = typeof meetContract
