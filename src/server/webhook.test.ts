import { createHash, createHmac, randomUUID } from 'node:crypto'
import { ANONYMOUS } from '@kernhq/contracts'
import { createHttpServer, createKernel, type Kernel, uuidv7 } from '@kernhq/kernel'
import { and, eq, isNull } from 'drizzle-orm'
import { AccessToken } from 'livekit-server-sdk'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { meetModule } from './index.js'
import { type LivekitRoomView, RECONCILE_GRACE_MS, reconcileMeetings } from './jobs.js'
import { meetings, participants } from './schema.js'

/**
 * Occupancy and history, proved without asking a browser.
 *
 * Two writers keep `participants` and `meetings` true, and both are exercised here against a real
 * Postgres and a real Fastify: the LiveKit webhook, posted the way LiveKit posts it, and the
 * reconciliation sweep, handed a stub media server.
 *
 * **The signature check is what this file is mostly about, and it is the part that is silently wrong
 * if it is written lazily.** LiveKit signs a base64 sha256 of the body's exact bytes into a JWT
 * claim, so a route that re-encodes the JSON before hashing is wrong — but *not* in a way that shows
 * up on the next delivery. Measured against `livekit/livekit-server:1.13.6` on 2026-09-06: its real
 * `room_started` and `room_finished` bodies are **byte-identical** after a `JSON.parse` →
 * `JSON.stringify` round trip, so a re-encoding implementation accepts them and looks correct. It
 * would start refusing on the first body whose re-encode differs, at a moment nobody chose, as an
 * authentication failure that reads as a wrong secret.
 *
 * So every body below is built as a string with **deliberately irregular spacing**: a synthetic
 * divergence, which is the only thing that makes the difference observable at all. Deleting the
 * buffer hash and hashing a re-encoding instead was measured turning 9 of these 16 tests red.
 *
 * The other half is what the route does with a delivery it cannot apply. LiveKit retries anything it
 * did not get a 2xx for, so 2xx on a dropped event loses it for ever — and a 4xx on a transient
 * failure loses it just as permanently, because 4xx means "delivered, stop sending". Both directions
 * are asserted.
 *
 * Two things this file cannot reach. It does not use LiveKit's own signatures — that was measured
 * separately, by pointing a real container's `webhook.urls` at a capture server and feeding the
 * captured bytes and `Authorization` header to `verifyLivekitWebhook`, which verified both and
 * refused both with one byte flipped. And it cannot prove that a killed browser tab produces
 * `participant_left` at all: that is Item 7's second proof, a running stack and `psql`, and it is a
 * run rather than a test.
 */

const BASE_URL = process.env.DATABASE_URL ?? 'postgres://kern:kern@localhost:5432/kern'
const suffix = `${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`
const DB_NAME = `kern_meet_hook_${suffix}`

const WS = '00000000-0000-4000-8000-00000000dd01'
const USER = '00000000-0000-4000-8000-00000000dd02'
const OTHER = '00000000-0000-4000-8000-00000000dd03'
const KEY = 'kern'
const SECRET = 'a-webhook-test-secret-long-enough-to-sign-with'

let admin: pg.Client
let owner: pg.Client
let kernel: Kernel
// The Fastify instance, typed off the kernel rather than off `fastify` — this package does not
// depend on it, and `module-billing` mounts a raw route without depending on it either.
let app: Awaited<ReturnType<typeof createHttpServer>>
let ownerUrl = ''

beforeAll(async () => {
  admin = new pg.Client({ connectionString: BASE_URL })
  await admin.connect()
  await admin.query(`create database "${DB_NAME}"`)

  const url = new URL(BASE_URL)
  url.pathname = `/${DB_NAME}`
  ownerUrl = url.toString()
  owner = new pg.Client({ connectionString: ownerUrl })
  await owner.connect()

  // The kernel migrates the folder itself at `start()`. The database is created from nothing here,
  // which is the only place a migration's behaviour means anything.

  process.env.LIVEKIT_URL = 'ws://livekit:7880'
  process.env.LIVEKIT_API_KEY = KEY
  process.env.LIVEKIT_API_SECRET = SECRET

  kernel = await createKernel({
    service: 'meet-webhook-test',
    modules: [meetModule],
    // 'api' on purpose: `startWorkers()` runs only for a worker, so the one-minute cron this module
    // registers cannot fire in the middle of an assertion.
    role: 'api',
    env: {
      DATABASE_URL: ownerUrl,
      KERN_SECRET: 'test-secret-that-is-long-enough-for-kern',
      NODE_ENV: 'test',
      NATS_URL: undefined,
      VALKEY_URL: undefined,
    },
  })
  kernel.broker.register('core', {
    'modules.isEnabled': { handler: async () => true },
    'authz.customRolePermissions': { handler: async () => [] },
    'authz.bindings': { handler: async () => [] },
    'settings.getModule': { handler: async () => ({}) },
    'settings.setModule': { handler: async () => ({ ok: true }) },
  })
  await kernel.start()

  /*
   * The real server, not the handler called directly.
   *
   * `raw: true` is a property of how the kernel mounts the route — an encapsulated scope with a
   * buffer content-type parser — so a test that invoked the handler with a `Buffer` it made itself
   * would assert nothing about the thing that actually delivers the bytes.
   */
  app = await createHttpServer({
    kernel,
    resolvePrincipal: async () => ANONYMOUS,
    corsOrigins: [],
  })
  await app.ready()
}, 180_000)

afterAll(async () => {
  await app?.close().catch(() => undefined)
  await kernel?.stop().catch(() => undefined)
  await owner?.end().catch(() => undefined)
  await admin?.query(`drop database if exists "${DB_NAME}" with (force)`).catch(() => undefined)
  await admin?.end().catch(() => undefined)
  for (const key of ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET']) delete process.env[key]
}, 60_000)

/** A meeting row, exactly as `meetings.start` leaves one: written before anybody is in it. */
async function seedMeeting(room: string, startedAt = new Date()): Promise<string> {
  const id = uuidv7()
  await kernel.database.withWorkspace(WS, (tx) =>
    tx.insert(meetings).values({
      id,
      workspaceId: WS,
      kind: 'direct',
      livekitRoom: room,
      startedBy: USER,
      startedAt,
      peakParticipants: 0,
    }),
  )
  return id
}

const meetingRow = (id: string) =>
  kernel.database.withWorkspace(WS, async (tx) => {
    const [row] = await tx.select().from(meetings).where(eq(meetings.id, id)).limit(1)
    return row
  })

const participantRows = (meetingId: string) =>
  kernel.database.withWorkspace(WS, (tx) =>
    tx.select().from(participants).where(eq(participants.meetingId, meetingId)),
  )

const openParticipantCount = async (meetingId: string) =>
  (
    await kernel.database.withWorkspace(WS, (tx) =>
      tx
        .select()
        .from(participants)
        .where(and(eq(participants.meetingId, meetingId), isNull(participants.leftAt))),
    )
  ).length

/**
 * A LiveKit event, as bytes.
 *
 * The spacing is uneven on purpose. `JSON.stringify` of the parsed object would not reproduce it, so
 * these bytes are only ever accepted by a route that hashed what it was given rather than what it
 * could rebuild.
 */
function bodyFor(event: string, room: string, identity?: string): Buffer {
  const participant = identity ? `,  "participant":{"identity":"${identity}"}` : ''
  return Buffer.from(
    `{"event":"${event}" ,"room":{"name":"${room}"}${participant},"id":"${randomUUID()}" ,"createdAt":"1757000000"}`,
    'utf8',
  )
}

/** The Authorization header LiveKit sends: a JWT signed with the API secret, carrying the body hash. */
async function sign(body: Buffer, opts: { over?: Buffer; secret?: string } = {}): Promise<string> {
  const token = new AccessToken(KEY, opts.secret ?? SECRET, { ttl: 60 })
  token.sha256 = createHash('sha256')
    .update(opts.over ?? body)
    .digest('base64')
  return token.toJwt()
}

/**
 * A JWT signed by hand.
 *
 * `AccessToken` refuses to be constructed with an empty secret, and the empty secret is exactly the
 * one an unconfigured instance would be verifying against — so the only way to try it is to sign the
 * three parts here. Nothing clever: HS256 is base64url of the header, the claims and an HMAC over
 * the two.
 */
function signByHand(secret: Buffer, claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
  const signed = `${part({ alg: 'HS256', typ: 'JWT' })}.${part(claims)}`
  return `${signed}.${createHmac('sha256', secret).update(signed).digest('base64url')}`
}

const post = (body: Buffer, authorization?: string) =>
  app.inject({
    method: 'POST',
    url: '/api/meet/webhooks/livekit',
    headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) },
    payload: body,
  })

/** Post a body with a token that genuinely covers it. The ordinary path. */
async function deliver(body: Buffer) {
  return post(body, await sign(body))
}

describe('the signature covers the exact bytes that arrived', () => {
  it('accepts a correctly signed join and records it', async () => {
    const room = `kern-${WS}-${randomUUID()}`
    const meetingId = await seedMeeting(room)
    const body = bodyFor('participant_joined', room, USER)

    const res = await deliver(body)
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toEqual({ received: true, applied: 'joined' })

    const rows = await participantRows(meetingId)
    expect(rows.map((r) => ({ userId: r.userId, leftAt: r.leftAt }))).toEqual([
      { userId: USER, leftAt: null },
    ])
    // The peak is maintained on write, because a row stamped with `left_at` cannot be counted back.
    expect((await meetingRow(meetingId))?.peakParticipants).toBe(1)
  })

  it('writes one row for the same delivery sent twice', async () => {
    /*
     * LiveKit retries anything it did not get a 2xx for, so the identical body arriving again is
     * routine rather than exotic. The partial unique index on `(meeting_id, user_id) where left_at
     * is null` is what makes the insert a no-op; nothing in the handler compares event ids.
     */
    const room = `kern-${WS}-${randomUUID()}`
    const meetingId = await seedMeeting(room)
    const body = bodyFor('participant_joined', room, USER)
    const authorization = await sign(body)

    const first = await post(body, authorization)
    const second = await post(body, authorization)
    expect([first.statusCode, second.statusCode]).toEqual([200, 200])
    expect((await participantRows(meetingId)).length, 'the retry inserted a second row').toBe(1)
  })

  it('refuses a valid token that was signed over different bytes', async () => {
    /*
     * The whole point of hashing the body: a token this instance would otherwise accept, replayed
     * against a body it does not cover. It verifies as a JWT — same secret, same issuer, unexpired —
     * and the digest is what refuses it.
     */
    const room = `kern-${WS}-${randomUUID()}`
    const meetingId = await seedMeeting(room)
    const body = bodyFor('participant_joined', room, USER)
    const somethingElse = bodyFor('participant_joined', room, OTHER)

    const res = await post(body, await sign(body, { over: somethingElse }))
    expect(res.statusCode).toBe(401)
    expect(await participantRows(meetingId), 'a refused delivery wrote a row').toEqual([])
  })

  it('refuses a token signed with a secret this instance does not hold', async () => {
    const room = `kern-${WS}-${randomUUID()}`
    const meetingId = await seedMeeting(room)
    const body = bodyFor('participant_joined', room, USER)

    const res = await post(body, await sign(body, { secret: 'not-the-secret-this-instance-holds' }))
    expect(res.statusCode).toBe(401)
    expect(await participantRows(meetingId)).toEqual([])
  })

  it('refuses a delivery with no Authorization header at all', async () => {
    const room = `kern-${WS}-${randomUUID()}`
    const meetingId = await seedMeeting(room)
    const res = await post(bodyFor('participant_joined', room, USER))
    expect(res.statusCode).toBe(401)
    expect(await participantRows(meetingId)).toEqual([])
  })

  it.each([
    ['empty, which is what every shipped compose file passes', ''],
    ['absent', undefined],
  ])('refuses everything when LIVEKIT_API_SECRET is %s', async (_label, value) => {
    /*
     * `mail`'s exact pattern, for `mail`'s exact reason. This route writes to the database and
     * resolves no principal, so an instance that has not enabled meetings must not be left with an
     * open unauthenticated write endpoint on the internet — and "not enabled" is the default state of
     * every self-hosted Kern, because the `calls` profile is not in a default install.
     *
     * Both shapes, because they are not the same thing: Compose emits a key it was given no value
     * for as the **empty string**, which a schema written the obvious way treats as configured.
     */
    const room = `kern-${WS}-${randomUUID()}`
    const meetingId = await seedMeeting(room)
    const body = bodyFor('participant_joined', room, USER)
    // Signed while the secret is still known, so what is being tested is the refusal and not the
    // impossibility of producing a token.
    const authorization = await sign(body)
    /*
     * The token that makes this test about the guard rather than about luck.
     *
     * Measured on 2026-09-06 by deleting the `isConfigured` check and running this file. A token
     * signed with the *real* secret is refused either way — the verifier no longer holds that
     * secret — so a test asserting only on that one passes with the guard gone. This one is signed
     * the way an unconfigured instance is verifying: with **no secret at all**. Without the guard it
     * came back **200** and the join was written, which is an open unauthenticated write endpoint on
     * every instance that has not enabled meetings.
     */
    const now = Math.floor(Date.now() / 1000)
    const forged = signByHand(Buffer.alloc(0), {
      iss: KEY,
      sub: 'livekit-server',
      nbf: now - 1,
      exp: now + 60,
      sha256: createHash('sha256').update(body).digest('base64'),
    })

    if (value === undefined) delete process.env.LIVEKIT_API_SECRET
    else process.env.LIVEKIT_API_SECRET = value
    try {
      for (const token of [authorization, forged]) {
        const res = await post(body, token)
        expect(res.statusCode).toBe(401)
        expect(res.json().message, 'refused for a reason other than being unconfigured').toMatch(
          /not configured/,
        )
      }
      expect(await participantRows(meetingId)).toEqual([])
    } finally {
      process.env.LIVEKIT_API_SECRET = SECRET
    }
  })
})

describe('what each event does to the tables', () => {
  it('stamps somebody out when the media server says they left', async () => {
    const room = `kern-${WS}-${randomUUID()}`
    const meetingId = await seedMeeting(room)
    await deliver(bodyFor('participant_joined', room, USER))

    const res = await deliver(bodyFor('participant_left', room, USER))
    expect(res.json()).toEqual({ received: true, applied: 'left' })
    const [row] = await participantRows(meetingId)
    expect(row?.leftAt, 'left_at was not stamped').toBeInstanceOf(Date)
  })

  it('closes the meeting, empties it, and announces it exactly once', async () => {
    const room = `kern-${WS}-${randomUUID()}`
    const meetingId = await seedMeeting(room)
    await deliver(bodyFor('participant_joined', room, USER))
    await deliver(bodyFor('participant_joined', room, OTHER))

    const heard: Array<Record<string, unknown>> = []
    const unsubscribe = await kernel.events.subscribe('meet.meeting.ended', (event) => {
      heard.push(event.payload as Record<string, unknown>)
    })
    try {
      const body = bodyFor('room_finished', room)
      const authorization = await sign(body)
      expect((await post(body, authorization)).json()).toEqual({ received: true, applied: 'ended' })
      // The retry, byte for byte. It must change nothing — and, because the event a subscriber acts
      // on is not idempotent for them, it must announce nothing either.
      expect((await post(body, authorization)).statusCode).toBe(200)

      const meeting = await meetingRow(meetingId)
      expect(meeting?.endedAt).toBeInstanceOf(Date)
      expect(meeting?.endedReason, 'the media server told us at the time').toBe('empty')
      expect(await openParticipantCount(meetingId), 'somebody is still shown as being in it').toBe(0)
      expect(heard).toEqual([{ meetingId, workspaceId: WS, reason: 'empty' }])
    } finally {
      await unsubscribe()
    }
  })

  it('acknowledges a room this instance has no meeting for, and writes nothing', async () => {
    /*
     * 2xx on a dropped event, and one of only two places this file accepts one. A retry cannot make
     * a meeting row appear, so 5xx would have LiveKit resending it for as long as it keeps the
     * delivery — and `room.auto_create: false` in the shipped `livekit.yaml` is what is supposed to
     * make this impossible in the first place, which is why it is logged rather than ignored.
     */
    const res = await deliver(bodyFor('participant_joined', `kern-${WS}-${randomUUID()}`, USER))
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ received: true, applied: 'unknown_room' })
  })

  it('acknowledges a participant whose identity is not a Kern user id, and writes nothing', async () => {
    // `user_id` is a uuid column, so an identity that is not one would be SQLSTATE 22P02 — a 500,
    // and a delivery LiveKit would retry for ever. Every token this module mints fixes the identity
    // to the user id; anything else is something else entirely (an agent, an egress) and is not
    // attendance.
    const room = `kern-${WS}-${randomUUID()}`
    const meetingId = await seedMeeting(room)
    const res = await deliver(bodyFor('participant_joined', room, 'egress-recorder-1'))
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ received: true, applied: 'unknown_identity' })
    expect(await participantRows(meetingId)).toEqual([])
  })

  it('acknowledges an event it has nothing to do about', async () => {
    const room = `kern-${WS}-${randomUUID()}`
    await seedMeeting(room)
    expect((await deliver(bodyFor('track_published', room, USER))).json()).toEqual({
      received: true,
      applied: 'ignored',
    })
  })
})

describe('the sweep, for when the webhook never arrived', () => {
  /** A stub media server. `RoomServiceClient` satisfies `LivekitRoomView` structurally. */
  const view = (rooms: string[], rosters: Record<string, string[]> = {}): LivekitRoomView => ({
    listRooms: async () => rooms.map((name) => ({ name })),
    listParticipants: async (room) => (rosters[room] ?? []).map((identity) => ({ identity })),
  })

  const longAgo = () => new Date(Date.now() - RECONCILE_GRACE_MS - 60_000)

  it('closes a meeting LiveKit no longer has a room for, and says the server found out late', async () => {
    const room = `kern-${WS}-${randomUUID()}`
    const meetingId = await seedMeeting(room, longAgo())
    await deliver(bodyFor('participant_joined', room, USER))

    const heard: Array<Record<string, unknown>> = []
    const unsubscribe = await kernel.events.subscribe('meet.meeting.ended', (event) => {
      heard.push(event.payload as Record<string, unknown>)
    })
    try {
      const report = await reconcileMeetings(kernel, view([]))
      expect(report.closed).toBeGreaterThanOrEqual(1)
      const meeting = await meetingRow(meetingId)
      expect(meeting?.endedAt).toBeInstanceOf(Date)
      expect(meeting?.endedReason, 'the label that says nobody told us at the time').toBe('reconciled')
      expect(await openParticipantCount(meetingId), 'a row still claims somebody is in it').toBe(0)
      expect(heard).toContainEqual({ meetingId, workspaceId: WS, reason: 'reconciled' })
    } finally {
      await unsubscribe()
    }
  })

  it('leaves a meeting that has only just started alone', async () => {
    /*
     * The reproduction the grace period exists for: `meetings.start` commits the row, then mints a
     * token, and the browser connects afterwards — so for the first moments of every call the
     * meeting exists here and the room does not exist there. Without the grace period this sweep
     * ends every call in the gap.
     */
    const room = `kern-${WS}-${randomUUID()}`
    const meetingId = await seedMeeting(room)
    await reconcileMeetings(kernel, view([]))
    expect((await meetingRow(meetingId))?.endedAt, 'a call was ended the second it started').toBeNull()
  })

  it('stamps out somebody LiveKit no longer sees in a room it still has', async () => {
    // The crashed tab: no `participant_left` was ever sent, and the row would otherwise say for ever
    // that this person is in a meeting they left.
    const room = `kern-${WS}-${randomUUID()}`
    const meetingId = await seedMeeting(room, longAgo())
    await deliver(bodyFor('participant_joined', room, USER))
    await deliver(bodyFor('participant_joined', room, OTHER))

    const report = await reconcileMeetings(kernel, view([room], { [room]: [OTHER] }))
    expect(report.departed).toBe(1)
    const rows = await participantRows(meetingId)
    expect(
      Object.fromEntries(rows.map((r) => [r.userId, r.leftAt === null])),
      'the person LiveKit still sees was stamped out, or the one it does not was not',
    ).toEqual({ [USER]: false, [OTHER]: true })
    expect((await meetingRow(meetingId))?.endedAt, 'the meeting is still live').toBeNull()
  })

  it('carries on when one room’s roster cannot be read', async () => {
    /*
     * A room LiveKit forgot between `listRooms` and `listParticipants` must not stop the sweep
     * repairing every other room. The failure is per room and caught there; a failure of `listRooms`
     * itself is deliberately not caught, so pg-boss retries rather than the job reporting a clean
     * run having asked nothing.
     */
    const broken = `kern-${WS}-${randomUUID()}`
    const fine = `kern-${WS}-${randomUUID()}`
    const brokenId = await seedMeeting(broken, longAgo())
    const fineId = await seedMeeting(fine, longAgo())
    await deliver(bodyFor('participant_joined', broken, USER))
    await deliver(bodyFor('participant_joined', fine, USER))

    const flaky: LivekitRoomView = {
      listRooms: async () => [{ name: broken }, { name: fine }],
      listParticipants: async (room) => {
        if (room === broken) throw new Error('room not found')
        return []
      },
    }
    const report = await reconcileMeetings(kernel, flaky)
    expect(report.departed, 'the readable room was repaired').toBe(1)
    expect(await openParticipantCount(fineId)).toBe(0)
    expect(await openParticipantCount(brokenId), 'the unreadable room was left as it was').toBe(1)
  })
})
