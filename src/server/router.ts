import {
  KernError,
  type Kernel,
  type RequestContext,
  requires,
  requiresCapability,
  type Tx,
  workspaceScoped,
} from '@kernhq/kernel'
import { implement } from '@orpc/server'
import type { MeetingEndedReason, MeetingKind } from '../contract/index.js'
import { MODULE_ID, meetContract } from '../contract/index.js'
import { MeetSettings } from '../contract/settings.js'
import { isConfigured, readMeetEnv } from './env.js'
import { isReachable, mintJoinToken, TOKEN_TTL_SECONDS } from './services/livekit.js'
import type { MeetingRow } from './services/meetings.js'
import { openMeetingById, recordJoin, startMeeting } from './services/meetings.js'

const os = implement(meetContract).$context<RequestContext>()

/**
 * The row shape the contract promises, from the row the database holds.
 *
 * `kind` and `endedReason` are `text` in Postgres and unions in the contract, so both are asserted
 * back to the contract's own types rather than to a hand-written list. A list written out here
 * drifts from the enum in `models.ts` and from the `check` constraint in `schema.ts` without
 * anything failing: the assertion satisfies `tsc` whatever it says, and the value that actually
 * arrives comes from the column.
 */
const toMeeting = (row: MeetingRow) => ({
  id: row.id,
  workspaceId: row.workspaceId,
  kind: row.kind as MeetingKind,
  livekitRoom: row.livekitRoom,
  roomId: row.roomId,
  object: row.objectId
    ? { module: row.objectModule as string, type: row.objectType as string, id: row.objectId }
    : null,
  title: row.title,
  startedBy: row.startedBy,
  startedAt: row.startedAt.toISOString(),
  endedAt: row.endedAt?.toISOString() ?? null,
  endedReason: (row.endedReason as MeetingEndedReason | null) ?? null,
  peakParticipants: row.peakParticipants,
})

export function meetRouter(kernel: Kernel) {
  const env = readMeetEnv()
  const scoped = os.use(workspaceScoped(MODULE_ID))
  const cap = requiresCapability(MODULE_ID, 'calls')

  const run = <T>(context: RequestContext, workspaceId: string, fn: (tx: Tx) => Promise<T>) =>
    kernel.database.withWorkspace(workspaceId, fn, { userId: context.principal.userId })

  /**
   * `moduleRaw` returns whatever an administrator saved, so it is parsed rather than cast: the row
   * is free-form JSON that an older version of this module may have written, and the zod defaults
   * are what make a workspace which has never opened the settings screen answer the same as one
   * that has.
   */
  const settingsFor = async (workspaceId: string) =>
    MeetSettings.parse(await kernel.settings.moduleRaw(workspaceId, MODULE_ID))

  /**
   * Mint a token for one person and one meeting.
   *
   * Every entry point that puts somebody into a call goes through here — `start` included, which is
   * why starting returns the same shape as joining. One authorisation site is one place to get this
   * wrong and one place to read when asking whether a grant is right; a second minting site is how a
   * check added later comes to cover three paths out of four.
   */
  const admit = async (context: RequestContext, meeting: MeetingRow) => {
    if (!isConfigured(env))
      throw new KernError(
        'UNAVAILABLE',
        'Meetings are not configured on this instance.',
        undefined,
        'meet.not_configured',
      )
    return {
      meeting: toMeeting(meeting),
      token: await mintJoinToken({
        env,
        room: meeting.livekitRoom,
        userId: context.principal.userId as string,
        displayName: context.principal.name ?? null,
      }),
      mediaUrl: env.LIVEKIT_URL as string,
      expiresIn: TOKEN_TTL_SECONDS,
    }
  }

  return os.router({
    config: {
      /**
       * Behind workspace membership and a permission, and behind **no capability**.
       *
       * The capability is the part that matters: an administrator whose meetings do not work has to
       * be able to find out why, and a diagnostic gated on the feature it diagnoses answers nothing.
       * `configured` and `reachable` stay separate for the same reason — a missing secret and a
       * stopped container are different problems, and one boolean sends the reader to the wrong one.
       *
       * `meet.call.join` rather than nothing, because a procedure with no permission is one every
       * member of every workspace with the module on may call, and this one names the instance's
       * media server. It is the widest of the three keys — guests hold it too — and it reads
       * "whoever may be in a meeting may find out why they cannot be".
       */
      get: scoped.config.get.use(requires('meet.call.join')).handler(async ({ input }) => ({
        configured: isConfigured(env),
        mediaUrl: env.LIVEKIT_URL ?? null,
        reachable: await isReachable(env),
        maxParticipants: (await settingsFor(input.workspaceId)).maxParticipants,
      })),
    },
    meetings: {
      start: scoped.meetings.start
        .use(cap)
        .use(requires('meet.call.start'))
        .handler(({ input, context }) =>
          run(context, input.workspaceId, async (tx) => {
            const meeting = await startMeeting(tx, {
              workspaceId: input.workspaceId,
              startedBy: context.principal.userId as string,
              title: input.title,
              object: input.object ?? null,
            })
            await recordJoin(tx, {
              meetingId: meeting.id,
              workspaceId: input.workspaceId,
              userId: context.principal.userId as string,
            })
            return admit(context, meeting)
          }),
        ),

      join: scoped.meetings.join
        .use(cap)
        .use(requires('meet.call.join'))
        .handler(({ input, context }) =>
          run(context, input.workspaceId, async (tx) => {
            const meeting = await openMeetingById(tx, input.workspaceId, input.meetingId)
            /**
             * NOT_FOUND rather than FORBIDDEN, for both cases — a meeting in another workspace and a
             * meeting that has ended. The transaction is workspace-bound, so another tenant's row is
             * already invisible here; answering 403 would tell a caller that an id they guessed
             * exists somewhere, which is the one thing this refusal must not carry.
             */
            if (!meeting)
              throw new KernError('NOT_FOUND', 'No such meeting.', undefined, 'meet.meeting_not_found')
            await recordJoin(tx, {
              meetingId: meeting.id,
              workspaceId: input.workspaceId,
              userId: context.principal.userId as string,
            })
            return admit(context, meeting)
          }),
        ),
    },
  })
}
