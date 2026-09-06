import { type Tx, uuidv7 } from '@kernhq/kernel'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { meetings, participants } from '../schema.js'

export type MeetingRow = typeof meetings.$inferSelect

/**
 * The LiveKit room name for a meeting.
 *
 * Derived from ids the server already holds, never supplied by a client — a room name is the entire
 * scope of a join token, so a client that could choose it could choose which meeting to be let into.
 * The workspace id is in it so that two instances sharing one media server cannot collide.
 */
export const livekitRoomName = (workspaceId: string, meetingId: string) => `kern-${workspaceId}-${meetingId}`

/**
 * The meeting a workspace object already has open, if any.
 *
 * An object — a chat conversation, an issue — has at most one live meeting, which the schema
 * enforces with a partial unique index. This read is what lets the second person to press *huddle*
 * **join** their colleague instead of colliding with that index and being shown an error for
 * pressing the same button.
 */
export async function openMeetingForObject(
  tx: Tx,
  workspaceId: string,
  object: { module: string; type: string; id: string },
): Promise<MeetingRow | null> {
  const [row] = await tx
    .select()
    .from(meetings)
    .where(
      and(
        eq(meetings.workspaceId, workspaceId),
        eq(meetings.objectModule, object.module),
        eq(meetings.objectType, object.type),
        eq(meetings.objectId, object.id),
        isNull(meetings.endedAt),
      ),
    )
    .limit(1)
  return row ?? null
}

/** A live meeting by id, or null. `ended_at is null` is part of the question, not a filter on it. */
export async function openMeetingById(
  tx: Tx,
  workspaceId: string,
  meetingId: string,
): Promise<MeetingRow | null> {
  const [row] = await tx
    .select()
    .from(meetings)
    .where(and(eq(meetings.workspaceId, workspaceId), eq(meetings.id, meetingId), isNull(meetings.endedAt)))
    .limit(1)
  return row ?? null
}

/**
 * Open an ad-hoc meeting. The row exists before any token is minted for it.
 *
 * `kind` is `huddle` when the meeting hangs off another module's object and `direct` otherwise.
 * Those, with `room`, are the only three values `meet_meetings_kind_ck` admits — a fourth
 * (`adhoc`, say) type-checks against a `text` column and is refused by Postgres with SQLSTATE
 * 23514 at the first insert, which is a `meetings.start` that has never worked.
 */
export async function startMeeting(
  tx: Tx,
  input: {
    workspaceId: string
    startedBy: string
    title?: string | null
    object?: { module: string; type: string; id: string } | null
  },
): Promise<MeetingRow> {
  const id = uuidv7()
  const [row] = await tx
    .insert(meetings)
    .values({
      id,
      workspaceId: input.workspaceId,
      kind: input.object ? 'huddle' : 'direct',
      livekitRoom: livekitRoomName(input.workspaceId, id),
      roomId: null,
      objectModule: input.object?.module ?? null,
      objectType: input.object?.type ?? null,
      objectId: input.object?.id ?? null,
      title: input.title ?? null,
      startedBy: input.startedBy,
      peakParticipants: 0,
    })
    .returning()
  return row!
}

/**
 * Record that somebody is in a meeting, and keep `peak_participants` true.
 *
 * The peak is maintained on write rather than computed on read, because a row is stamped with
 * `left_at` when somebody goes, so the highest concurrent count is not recoverable from the rows
 * afterwards. `greatest(...)` against a live count in one statement is what stops two people joining
 * in the same moment from each reading the old value and writing the same new one.
 *
 * Re-joining is not a second row: the partial unique index is `(meeting_id, user_id) where left_at
 * is null`, so a reconnect updates the row it already has. Somebody who leaves and comes back gets a
 * new one, which is what makes the history honest about a dropped connection.
 */
export async function recordJoin(
  tx: Tx,
  args: { meetingId: string; workspaceId: string; userId: string },
): Promise<void> {
  await tx
    .insert(participants)
    .values({
      id: uuidv7(),
      workspaceId: args.workspaceId,
      meetingId: args.meetingId,
      userId: args.userId,
    })
    .onConflictDoNothing()

  await tx.execute(sql`
    update ${meetings}
       set peak_participants = greatest(
             ${meetings.peakParticipants},
             (select count(*) from ${participants}
               where ${participants.meetingId} = ${args.meetingId}
                 and ${participants.leftAt} is null))
     where ${meetings.id} = ${args.meetingId}`)
}
