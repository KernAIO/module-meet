import type { WorkspaceId } from '@kernhq/contracts'
import type { JobDef, Kernel } from '@kernhq/kernel'
import { isNull } from 'drizzle-orm'
import { meetEvents } from '../contract/index.js'
import { readMeetEnv } from './env.js'
import { meetings } from './schema.js'
import { roomServiceClient } from './services/livekit.js'
import { ALL_WORKSPACES, closeMeeting, markParticipantLeft, openParticipantsOf } from './services/webhook.js'

/**
 * This module's scheduled work.
 *
 * One job today, and it exists because **a webhook is a message and a message can be lost**. The
 * LiveKit webhook keeps `meetings` and `participants` right within a second of anything happening;
 * this asks the media server what is actually true and repairs whatever the webhook did not deliver
 * — a delivery that could not reach core while it was restarting, a `room_finished` that arrived
 * while the database was away, a browser killed mid-call on a network that never sent the
 * disconnect. Without it the failure is not an error anybody sees: it is a row saying somebody is in
 * a meeting they left, on the rooms page, indefinitely.
 *
 * The two together are the whole claim: with the webhook the tables are right within a second,
 * without it within a minute, and a crash cannot leave occupancy permanently wrong.
 */

/**
 * How long a meeting is left alone before the sweep will close it for having no LiveKit room.
 *
 * A meeting row is written before anybody is in it — `meetings.start` commits the row, then mints a
 * token, and the browser connects afterwards — so for the first moments of every call the meeting
 * exists here and the room does not exist there. A sweep with no grace period would close every
 * meeting in the gap between those two events.
 *
 * Two minutes rather than two seconds because the sweep runs every sixty: the cost of being generous
 * is one more pass before an abandoned meeting is tidied away, and the cost of being tight is calls
 * that end the instant they start.
 */
export const RECONCILE_GRACE_MS = 120_000

/**
 * The part of LiveKit's `RoomServiceClient` the sweep uses, named as an interface so a test can hand
 * it a stub.
 *
 * `RoomServiceClient` satisfies it structurally — nothing here re-declares its behaviour. The point
 * is that the reconciliation *rules* (the grace period, closing a meeting whose room is gone,
 * stamping out somebody LiveKit no longer sees) can be reproduced without a media server, which is
 * the only way they get tested at all before Item 13's two-machine run.
 */
export interface LivekitRoomView {
  listRooms(): Promise<Array<{ name: string }>>
  listParticipants(room: string): Promise<Array<{ identity: string }>>
}

/** What one sweep did. Returned so a test can assert on it, and so the log line says something. */
export interface ReconcileReport {
  /** live meetings the sweep looked at */
  checked: number
  /** meetings closed because LiveKit no longer had their room */
  closed: number
  /** participant rows stamped out because LiveKit no longer knew the person */
  departed: number
}

/**
 * Ask LiveKit what is true, and make the tables agree.
 *
 * It runs as a service principal binding `app.workspace_id = '*'`, because "which meetings are live
 * anywhere on this instance" is a question about every workspace at once and the sweep is woken by a
 * clock rather than by a request. The policies admit that sentinel explicitly and do **not** admit an
 * unbound transaction, so forgetting the binding here is an empty result rather than a leak.
 *
 * A failure reaching LiveKit is left to throw: pg-boss retries the job, and a sweep that swallowed
 * the error would report a clean run having asked nothing. A failure reading **one room's** roster is
 * caught, because one room LiveKit has forgotten between the two calls must not stop the sweep
 * repairing the other twenty.
 */
export async function reconcileMeetings(kernel: Kernel, livekit: LivekitRoomView): Promise<ReconcileReport> {
  const open = await kernel.database.withWorkspace(ALL_WORKSPACES, (tx) =>
    tx.select().from(meetings).where(isNull(meetings.endedAt)),
  )
  if (open.length === 0) return { checked: 0, closed: 0, departed: 0 }

  const liveRooms = new Set((await livekit.listRooms()).map((room) => room.name))
  const occupants = await kernel.database.withWorkspace(ALL_WORKSPACES, (tx) =>
    openParticipantsOf(
      tx,
      open.map((m) => m.id),
    ),
  )

  const cutoff = Date.now() - RECONCILE_GRACE_MS
  const toClose = open.filter((m) => !liveRooms.has(m.livekitRoom) && m.startedAt.getTime() <= cutoff)
  const stillLive = open.filter((m) => liveRooms.has(m.livekitRoom))

  /*
   * Whose row says they are in a call LiveKit no longer sees them in.
   *
   * Only rooms that actually have an open row are asked about: a live meeting nobody is recorded in
   * has nothing to reconcile, and each `listParticipants` is a round trip to the media server on a
   * one-minute clock.
   */
  const departures: Array<{ meetingId: string; userId: string }> = []
  for (const meeting of stillLive) {
    const rows = occupants.filter((o) => o.meetingId === meeting.id)
    if (rows.length === 0) continue
    let present: Set<string>
    try {
      present = new Set((await livekit.listParticipants(meeting.livekitRoom)).map((p) => p.identity))
    } catch (err) {
      kernel.log.warn({ err: String(err), room: meeting.livekitRoom }, 'meet: could not read a room roster')
      continue
    }
    for (const row of rows) if (!present.has(row.userId)) departures.push(row)
  }

  // The cast is where "this uuid is a workspace" is asserted: the value came out of
  // `mod_meet.meetings`, whose row was written under `workspaceScoped`, which is the middleware that
  // parsed it as a `WorkspaceId` in the first place.
  const closed: Array<{ meetingId: string; workspaceId: WorkspaceId }> = []
  let departed = 0
  if (toClose.length > 0 || departures.length > 0) {
    departed = await kernel.database.withWorkspace(ALL_WORKSPACES, async (tx) => {
      let n = 0
      for (const meeting of toClose) {
        // `reconciled` rather than `empty`: the honest label for a meeting nobody told us about at
        // the time. History then says the server found out late instead of pretending otherwise.
        if (await closeMeeting(tx, meeting.id, 'reconciled'))
          closed.push({ meetingId: meeting.id, workspaceId: meeting.workspaceId as WorkspaceId })
      }
      for (const row of departures) if (await markParticipantLeft(tx, row)) n += 1
      return n
    })
  }

  for (const meeting of closed)
    await kernel.emit(
      meetEvents.meetingEnded,
      { ...meeting, reason: 'reconciled' },
      { workspaceId: meeting.workspaceId },
    )

  if (closed.length > 0 || departed > 0)
    kernel.log.info(
      { checked: open.length, closed: closed.length, departed },
      'meet: reconciled meetings against LiveKit',
    )
  return { checked: open.length, closed: closed.length, departed }
}

export function meetJobs(): JobDef[] {
  return [
    {
      /**
       * `meet.reconcile`, every minute.
       *
       * A minute is the floor a cron expression can express, and it is also the number the product
       * promises: occupancy is right within a second when the webhook arrives and within a minute
       * when it does not.
       *
       * The environment is read **inside the handler** rather than captured when the module is
       * defined. A module's `jobs` are built at import time, which in a host service is before its
       * entry point has finished loading the environment; a handler that captured the empty value
       * then would do nothing for the life of the process on a perfectly well configured instance.
       *
       * An instance with no media server has nothing to reconcile and is not an error — the `calls`
       * profile is not in a default install, and this job is registered wherever the module is
       * hosted.
       */
      name: 'reconcile',
      cron: '* * * * *',
      handler: async (_input, { kernel }) => {
        const livekit = roomServiceClient(readMeetEnv())
        if (!livekit) return
        await reconcileMeetings(kernel, livekit)
      },
    },
  ]
}
