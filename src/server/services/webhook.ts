import { createHash, timingSafeEqual } from 'node:crypto'
import type { WorkspaceId } from '@kernhq/contracts'
import { KernError, type Kernel, type Tx } from '@kernhq/kernel'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { TokenVerifier, type WebhookEvent, WebhookReceiver } from 'livekit-server-sdk'
import { z } from 'zod'
import { type MeetingEndedReason, meetEvents } from '../../contract/index.js'
import { isConfigured, type MeetEnv } from '../env.js'
import { meetings, participants } from '../schema.js'
import { type MeetingRow, recordJoin } from './meetings.js'

/**
 * Occupancy and history, written by the two things that actually know.
 *
 * A browser is never asked. A client that reports its own attendance reports it wrong the moment it
 * crashes, and the row it leaves behind claims somebody is in a call they left an hour ago — which
 * is a face on the rooms page belonging to a person who went home. So `participants` has exactly two
 * writers, and both are here: the media server's webhook (this file's `applyLivekitEvent`) and the
 * reconciliation sweep (`../jobs.ts`, which imports the appliers below).
 *
 * Both bind `app.workspace_id = '*'` because neither starts from a request. Neither knows a
 * workspace until it has found the meeting the room name belongs to.
 */

/**
 * The binding `mod_meet`'s row-level policies admit for instance-wide work.
 *
 * A literal sentinel rather than "an unbound transaction", and the difference is the whole design:
 * binding `'*'` is something a job does on purpose and can be grepped for, where an unbound
 * transaction is something that happens by omission. A policy admitting the second would make
 * forgetting to bind a leak instead of a refusal.
 */
export const ALL_WORKSPACES = '*'

/**
 * What one delivery did, so the answer says which and a log line is worth reading.
 *
 * `unknown_room` and `unknown_identity` are 2xx on purpose and are the only two dropped events that
 * are: a retry cannot make a meeting row appear for a room this instance has no record of, and it
 * cannot turn a non-user identity into a Kern user. Everything else that fails to apply throws, and
 * the route answers 5xx so LiveKit retries.
 */
export type AppliedOutcome =
  | 'started'
  | 'joined'
  | 'left'
  | 'ended'
  | 'ignored'
  | 'unknown_room'
  | 'unknown_identity'

/** LiveKit's participant identity is the Kern user id, fixed when the token is minted. */
const ParticipantIdentity = z.uuid()

/**
 * Compare two digests in time that does not depend on how much of them is right.
 *
 * `timingSafeEqual` throws on a length mismatch, so both sides are hashed first and the comparison
 * is always over two 32-byte buffers — which also means a missing claim compares as a wrong one
 * rather than as a special case.
 */
function digestsMatch(presented: string, expected: string): boolean {
  const a = createHash('sha256').update(presented).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

const unauthorised = (message: string) =>
  new KernError('UNAUTHORIZED', message, undefined, 'meet.webhook_unauthorised')

/**
 * The signature, checked against the **exact bytes that arrived**.
 *
 * LiveKit signs a webhook by putting the base64 sha256 of the body into a claim of a JWT signed with
 * the API secret, and sending that JWT in `Authorization`. Measured against a real
 * `livekit/livekit-server:1.13.6` on 2026-09-06: its `room_started` and `room_finished` deliveries
 * verified here, and flipping a single byte of either body was refused. `ModuleHttpRoute`'s
 * `raw: true` is what hands this function those bytes rather than whatever Fastify's parsers made of
 * them.
 *
 * **The reason to hash the `Buffer` is sharper than "a re-encode changes the bytes", and the sharper
 * version is the one that matters.** In the same run, both of those real bodies came back
 * *byte-identical* from a `JSON.parse` → `JSON.stringify` round trip — so an implementation that
 * hashed a re-encoding would have accepted both and looked perfectly correct. It would start
 * refusing on the first body whose re-encode differs (a name that escapes differently, a number
 * formatted another way), at a moment nobody chose, and it would refuse as an *authentication*
 * failure — which reads as a wrong secret and sends whoever is diagnosing it to `.env`. That is why
 * the hash is computed here, over the buffer, rather than by handing the SDK a decoded string:
 * `WebhookReceiver.receive` takes a `string` and encodes it again to hash it. The SDK still does the
 * parsing (`skipAuth`, below), because that half is a protobuf JSON reader worth reusing; it is only
 * ever reached once the bytes are proven.
 *
 * **401 when `LIVEKIT_API_SECRET` is empty**, which is every instance that has not enabled meetings.
 * This is a route that writes to the database and answers before any Kern principal exists, so an
 * unconfigured instance must not leave an unauthenticated write endpoint open on the internet — the
 * same reason `mail`'s provider webhook refuses everything without `MAIL_WEBHOOK_TOKEN`, and the
 * same failure it had before it did.
 */
export async function verifyLivekitWebhook(
  env: MeetEnv,
  body: Buffer,
  authHeader: string | undefined,
): Promise<WebhookEvent> {
  if (!isConfigured(env)) throw unauthorised('Meetings are not configured on this instance.')
  if (!authHeader) throw unauthorised('The Authorization header is missing.')

  let sha256: string | undefined
  try {
    const claims = await new TokenVerifier(
      env.LIVEKIT_API_KEY as string,
      env.LIVEKIT_API_SECRET as string,
    ).verify(authHeader)
    sha256 = claims.sha256
  } catch {
    throw unauthorised('The webhook signature did not verify.')
  }
  if (!digestsMatch(sha256 ?? '', createHash('sha256').update(body).digest('base64')))
    throw unauthorised('The webhook signature does not cover this body.')

  try {
    // `skipAuth`, because the two things it would do — verify the JWT and hash the body — have both
    // just been done above, and one of them was done over the bytes rather than over a re-encoding.
    return await new WebhookReceiver(env.LIVEKIT_API_KEY as string, env.LIVEKIT_API_SECRET as string).receive(
      body.toString('utf8'),
      undefined,
      true,
    )
  } catch (err) {
    // The signature held, so whoever sent this holds the API secret; a body that will never parse
    // will not parse on the tenth retry either. 400 stops LiveKit resending it for ever.
    throw new KernError(
      'BAD_REQUEST',
      'The webhook body is not a LiveKit event.',
      { reason: String(err) },
      'meet.webhook_unreadable',
    )
  }
}

/** The meeting a LiveKit room name belongs to. The column is unique, so this is one row or none. */
export async function meetingForRoom(tx: Tx, room: string): Promise<MeetingRow | null> {
  const [row] = await tx.select().from(meetings).where(eq(meetings.livekitRoom, room)).limit(1)
  return row ?? null
}

/**
 * Stamp somebody out of a meeting, if they are currently in it.
 *
 * Returns whether a row changed, which is what makes a repeat delivery a no-op rather than a second
 * departure: LiveKit retries anything it did not get a 2xx for, so the same `participant_left`
 * arrives twice as a matter of routine.
 */
export async function markParticipantLeft(
  tx: Tx,
  args: { meetingId: string; userId: string },
): Promise<boolean> {
  const changed = await tx
    .update(participants)
    .set({ leftAt: new Date() })
    .where(
      and(
        eq(participants.meetingId, args.meetingId),
        eq(participants.userId, args.userId),
        isNull(participants.leftAt),
      ),
    )
    .returning({ id: participants.id })
  return changed.length > 0
}

/**
 * Close a meeting and stamp out everybody still shown as being in it.
 *
 * Returns whether this call is the one that closed it. Both writers race by design — the webhook
 * arrives within a second and the sweep runs every minute — so the second one to get here must
 * change nothing *and* say so, because that boolean is what stops `meet.meeting.ended` being emitted
 * twice for one meeting.
 */
export async function closeMeeting(tx: Tx, meetingId: string, reason: MeetingEndedReason): Promise<boolean> {
  const now = new Date()
  const closed = await tx
    .update(meetings)
    .set({ endedAt: now, endedReason: reason, updatedAt: now })
    .where(and(eq(meetings.id, meetingId), isNull(meetings.endedAt)))
    .returning({ id: meetings.id })
  if (closed.length === 0) return false
  await tx
    .update(participants)
    .set({ leftAt: now })
    .where(and(eq(participants.meetingId, meetingId), isNull(participants.leftAt)))
  return true
}

/** The open participant rows of a set of meetings, for the sweep to compare against LiveKit. */
export async function openParticipantsOf(
  tx: Tx,
  meetingIds: string[],
): Promise<Array<{ meetingId: string; userId: string }>> {
  if (meetingIds.length === 0) return []
  return tx
    .select({ meetingId: participants.meetingId, userId: participants.userId })
    .from(participants)
    .where(and(inArray(participants.meetingId, meetingIds), isNull(participants.leftAt)))
}

/**
 * Apply one verified event.
 *
 * Everything here is idempotent, because a webhook delivery is retried until it is acknowledged and
 * the retry carries the same bytes: the join is an `on conflict do nothing` against the partial
 * unique index on `(meeting_id, user_id) where left_at is null`, the departure and the close both
 * name `is null` in their predicates and report whether they changed anything.
 *
 * It throws for anything it could not apply, so the route can answer 5xx and LiveKit will try again.
 * The two exceptions are the outcomes that a retry cannot fix, and each is named rather than folded
 * into a general shrug.
 */
export async function applyLivekitEvent(kernel: Kernel, event: WebhookEvent): Promise<AppliedOutcome> {
  const room = event.room?.name
  // egress and ingress events carry no room this module holds a meeting for.
  if (!room) return 'ignored'

  const identity = event.participant?.identity
  /*
   * `WorkspaceId` is a branded string and a row's `workspace_id` is a plain one, so the cast is where
   * "this uuid is a workspace" is asserted. It is safe here for a reason worth writing down rather
   * than assuming: the value came out of `mod_meet.meetings`, whose row was written by
   * `meetings.start` under `workspaceScoped`, which is the middleware that parsed it as a
   * `WorkspaceId` in the first place.
   */
  const ended: Array<{ meetingId: string; workspaceId: WorkspaceId; reason: MeetingEndedReason }> = []

  const outcome = await kernel.database.withWorkspace(ALL_WORKSPACES, async (tx): Promise<AppliedOutcome> => {
    const meeting = await meetingForRoom(tx, room)
    /*
     * A room LiveKit has and Kern does not. `room.auto_create: false` in the shipped `livekit.yaml`
     * is what is supposed to make this impossible — only core, holding the API secret, creates a
     * room — so it is logged rather than silently dropped. It is still a 2xx: no number of retries
     * will make a meeting row appear.
     */
    if (!meeting) {
      kernel.log.warn({ room, event: event.event }, 'meet: a LiveKit webhook named a room with no meeting')
      return 'unknown_room'
    }

    switch (event.event) {
      case 'room_started':
        // The row was written by `meetings.start` before any token was minted for it, so there is
        // nothing to record. Acknowledged so LiveKit stops resending it.
        return 'started'

      case 'participant_joined': {
        if (meeting.endedAt) return 'ignored'
        if (!identity || !ParticipantIdentity.safeParse(identity).success) {
          kernel.log.warn(
            { room, identity },
            'meet: a participant joined with an identity that is not a user id',
          )
          return 'unknown_identity'
        }
        await recordJoin(tx, {
          meetingId: meeting.id,
          workspaceId: meeting.workspaceId,
          userId: identity,
        })
        return 'joined'
      }

      case 'participant_left': {
        if (!identity || !ParticipantIdentity.safeParse(identity).success) return 'unknown_identity'
        await markParticipantLeft(tx, { meetingId: meeting.id, userId: identity })
        return 'left'
      }

      case 'room_finished': {
        // `empty` rather than `reconciled`: the media server told us at the time, which is the
        // difference the two labels exist to record.
        if (await closeMeeting(tx, meeting.id, 'empty'))
          ended.push({
            meetingId: meeting.id,
            workspaceId: meeting.workspaceId as WorkspaceId,
            reason: 'empty',
          })
        return 'ended'
      }

      default:
        return 'ignored'
    }
  })

  // After the transaction, and only for the delivery that actually closed the meeting — a retry of
  // the same `room_finished` changes nothing and announces nothing.
  for (const e of ended) await kernel.emit(meetEvents.meetingEnded, e, { workspaceId: e.workspaceId })
  return outcome
}
