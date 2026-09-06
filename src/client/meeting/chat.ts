/**
 * What a line of in-meeting chat is.
 *
 * Its own file rather than a type on the session, so the mock and the panel can name it without
 * reaching `room.svelte.ts` — which is the one file in this package that loads a WebRTC SDK, and
 * the one nothing outside the meeting route may pull in behind it.
 *
 * There is no server type to derive this from, and that is the design rather than an omission: the
 * panel rides LiveKit's data channel, so these lines exist in the browsers that are in the meeting
 * and nowhere else. When the meeting ends there is nothing to delete, and the panel's own header
 * says so in all five locales. A huddle started from a chat conversation keeps its durable record
 * in that conversation, one click away.
 */
export interface ChatLine {
  id: string
  from: string
  body: string
  /** Epoch milliseconds; the panel formats it in the reader's own locale and digits. */
  at: number
  mine: boolean
}
