import { WorkspaceId } from '@kernhq/contracts'
import { z } from 'zod'

/**
 * The nouns this module owns, and the shapes that cross the wire.
 *
 * Imported by **both** halves — the server implements against them, the client calls against them —
 * so nothing here may touch Node. Types only; the procedures live in `router.ts`.
 */

/** Lowercase, 2-32 characters. Names the API prefix, the Postgres schema `mod_<id>` and every event. */
export const MODULE_ID = 'meet'

/** Every procedure takes the workspace it is acting in; `workspaceScoped()` reads it off the input. */
export const ws = z.object({ workspaceId: WorkspaceId })

/**
 * How a meeting came to exist. It is set once, when the row is written, and never changes.
 *
 * - `direct` — one person rang another. The invite rows are the ring.
 * - `huddle` — started from something else in the product (a chat conversation today), so it carries
 *   an object reference and at most one of them may be live for that object at a time.
 * - `room` — somebody walked into a persistent room. Nobody is rung.
 *
 * Stored rather than derived from which columns are null, because "why does this meeting exist" is
 * what decides who may join it, and a rule that reads a null column is a rule that changes meaning
 * the day a column becomes optional.
 */
export const MeetingKind = z.enum(['direct', 'huddle', 'room'])
export type MeetingKind = z.infer<typeof MeetingKind>

/**
 * Why a meeting stopped, recorded so history can say something better than "it ended".
 *
 * `empty` is the ordinary one — LiveKit closes a room when the last person leaves. `reconciled` is
 * the honest label for a meeting the sweep closed because LiveKit no longer had the room: it says
 * the server was told late rather than pretending it was told on time.
 */
export const MeetingEndedReason = z.enum(['empty', 'ended_by_host', 'reconciled', 'expired'])
export type MeetingEndedReason = z.infer<typeof MeetingEndedReason>

/**
 * What happened to one ring.
 *
 * `missed` is a *terminal* state written by a sweep, not the absence of an answer: a ring that only
 * existed in a realtime message is a call that a reconnect can lose, which is why the row exists at
 * all. Everything but `ringing` is final, and `resolved_at` is stamped when it becomes final.
 */
export const CallInviteState = z.enum(['ringing', 'answered', 'declined', 'cancelled', 'missed'])
export type CallInviteState = z.infer<typeof CallInviteState>

/**
 * A persistent place. Entering one rings nobody, and it is there tomorrow.
 *
 * Every room in this release is open to the workspace. Invite-only rooms need a member roster and a
 * different fan-out for occupancy — an object channel is authorised on workspace membership alone,
 * so a private room's roster would be readable by anybody in the workspace — and both are deferred.
 */
export const Room = z.object({
  id: z.uuid(),
  workspaceId: WorkspaceId,
  /** URL segment, unique within the workspace. Lowercase, so two rooms cannot differ only in case. */
  slug: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable(),
  createdBy: z.uuid().nullable(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type Room = z.infer<typeof Room>

/**
 * What a huddle is attached to — a chat conversation today, an issue or a page later.
 *
 * Three plain strings rather than a foreign key: a module keeps its joins inside its own schema, and
 * `object_module` is by definition somebody else's. The module that owns the object is the one asked
 * whether the caller may reach it, on **every** join rather than once at the start — snapshotting a
 * channel's member set onto a meeting is how somebody removed from a private conversation keeps
 * getting into its huddle.
 */
export const ObjectRef = z.object({
  module: z.string().min(2).max(32),
  type: z.string().min(1).max(64),
  id: z.string().min(1).max(128),
})
export type ObjectRef = z.infer<typeof ObjectRef>

/**
 * One occurrence: a call that is happening, or one that happened.
 *
 * `livekitRoom` is the name LiveKit knows it by and is unique across the whole instance, because
 * LiveKit's room namespace is not per workspace. It is generated, never taken from a request — a
 * room name a caller can choose is a room name a caller can collide with somebody else's.
 */
export const Meeting = z.object({
  id: z.uuid(),
  workspaceId: WorkspaceId,
  kind: MeetingKind,
  livekitRoom: z.string().min(1).max(128),
  /** Set only when `kind` is `room`. */
  roomId: z.uuid().nullable(),
  /** Set only when `kind` is `huddle`. */
  object: ObjectRef.nullable(),
  title: z.string().max(200).nullable(),
  startedBy: z.uuid(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  endedReason: MeetingEndedReason.nullable(),
  /** The most people who were in it at once, so history can say how big it got. */
  peakParticipants: z.number().int().min(0),
})
export type Meeting = z.infer<typeof Meeting>

/**
 * Somebody's attendance of one meeting.
 *
 * Written by the LiveKit webhook and by the reconciliation sweep, never by a browser: a client that
 * reports its own attendance reports it wrong the moment it crashes, and a row claiming somebody is
 * still in a call they left is worse than no row at all.
 */
export const Participant = z.object({
  id: z.uuid(),
  workspaceId: WorkspaceId,
  meetingId: z.uuid(),
  userId: z.uuid(),
  joinedAt: z.iso.datetime(),
  leftAt: z.iso.datetime().nullable(),
})
export type Participant = z.infer<typeof Participant>

/**
 * One ring, made durable.
 *
 * A ring that exists only as a realtime message is a call a reconnect can lose: the socket drops
 * between the caller pressing Call and the callee's browser subscribing, and nothing anywhere knows
 * a call was ever attempted. The row is what a client re-reads on mount and on every reconnect, and
 * what a sweep ages into a missed call somebody can ring back from.
 */
export const CallInvite = z.object({
  id: z.uuid(),
  workspaceId: WorkspaceId,
  meetingId: z.uuid(),
  fromUserId: z.uuid(),
  toUserId: z.uuid(),
  state: CallInviteState,
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
})
export type CallInvite = z.infer<typeof CallInvite>
