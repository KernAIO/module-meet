/**
 * `<module>.<entity>.<action>`. Anything that emits one declares it here.
 *
 * Payloads carry **ids, never rows** — and for this module, never a participant list. A subscriber
 * that needs to know who is in a meeting asks `meetings.get` with its own principal, where the
 * server decides what that caller may see; an event carrying the roster is a way to read a meeting's
 * occupancy past every permission check, and the realtime object channel it would ride is authorised
 * on workspace membership alone.
 *
 * Empty, because nothing emits anything yet. `meet.meeting.ended` arrives with the webhook that can
 * honestly say a meeting ended; declaring it now would be a name subscribers could listen for and
 * never hear.
 */
export const meetEvents = {}
