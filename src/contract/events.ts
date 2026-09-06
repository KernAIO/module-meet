import { defineEvent, WorkspaceId } from '@kernhq/contracts'
import { z } from 'zod'
import { MeetingEndedReason } from './models.js'

/**
 * `<module>.<entity>.<action>`. Anything that emits one declares it here.
 *
 * Payloads carry **ids, never rows** — and for this module, never a participant list. A subscriber
 * that needs to know who is in a meeting asks `meetings.get` with its own principal, where the
 * server decides what that caller may see; an event carrying the roster is a way to read a meeting's
 * occupancy past every permission check, and the realtime object channel it would ride is authorised
 * on workspace membership alone.
 */
export const meetEvents = {
  /**
   * A meeting stopped, and something outside this module may want to say so.
   *
   * Declared in the commit that first emits it. Two writers do: the LiveKit webhook, when the media
   * server reports `room_finished`, and the reconciliation sweep, when LiveKit no longer has the
   * room a live meeting claims. `reason` tells those two apart — `empty` is the ordinary close and
   * `reconciled` says the server was told late rather than pretending it was told on time — which is
   * the difference a subscriber writing "Huddle ended · 12 min · 4 people" into a chat conversation
   * cannot see any other way.
   *
   * Nothing subscribes to it inside this module. It exists for what is outside, and for the huddle
   * transcript message that arrives with huddles.
   */
  meetingEnded: defineEvent(
    'meet.meeting.ended',
    z.object({ meetingId: z.uuid(), workspaceId: WorkspaceId, reason: MeetingEndedReason }),
  ),
}
