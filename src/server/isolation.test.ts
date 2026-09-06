import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Principal } from '@kernhq/contracts'
import { CAPABILITIES_KEY, createKernel, type Kernel, type RequestContext } from '@kernhq/kernel'
import { call } from '@orpc/server'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { meetModule } from './index.js'
import { meetRouter } from './router.js'
import { TENANT_TABLES } from './schema.js'

/**
 * Row-level security, asked of Postgres under a role that cannot bypass it.
 *
 * **`nosuperuser nobypassrls` is the whole point of this file.** The development database on a
 * laptop, and the `postgres` role in most CI containers, are superusers — and a superuser bypasses
 * every policy. Assert isolation as one and the test passes exactly as happily against tables
 * carrying no policy at all, which is how `mod_mail` ran for months with row-level security on
 * nothing. That trap is recorded in core's notes; this is the role that avoids it.
 *
 * `force row level security` is the second half. A table's owner is exempt from its own policies
 * unless the table forces them, and the owner is the role the service connects as — so a policy
 * without `force` is decorative in the one deployment that matters. The probe role here is neither
 * superuser nor owner, so it is subject to the policies either way; `migrations.test.ts` is what
 * asserts `force` is actually set on every table.
 *
 * The first half of this file asserts the **last** line — that a session bound to one workspace
 * cannot read or write another's rows whatever a query's `where` clause says. The last block
 * asserts the **first** line, against the real router: that a member of one workspace cannot obtain
 * a LiveKit token for a meeting in another. Both are needed and neither substitutes for the other —
 * the policies hold when a query forgets its predicate, and the router is what a person actually
 * reaches.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = join(HERE, '../../migrations')
const BASE_URL = process.env.DATABASE_URL ?? 'postgres://kern:kern@localhost:5432/kern'
const suffix = `${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`
const DB_NAME = `kern_meet_iso_${suffix}`
const RLS_ROLE = `kern_meet_iso_rls_${suffix}`

const WS_A = '00000000-0000-4000-8000-00000000aa01'
const WS_B = '00000000-0000-4000-8000-00000000bb01'
const ROOM_A = '00000000-0000-4000-8000-00000000aa02'
const ROOM_B = '00000000-0000-4000-8000-00000000bb02'
const USER = '00000000-0000-4000-8000-00000000cc01'

let admin: pg.Client
/** The owner connection, used only to build the database and the probe role. */
let owner: pg.Client
/** The connection everything is asserted through: no superuser, no bypass, not the owner. */
let plain: pg.Client
/** The scratch database, as the owner. What the kernel in the last block connects to. */
let ownerUrl = ''

beforeAll(async () => {
  admin = new pg.Client({ connectionString: BASE_URL })
  await admin.connect()
  await admin.query(`create database "${DB_NAME}"`)

  const url = new URL(BASE_URL)
  url.pathname = `/${DB_NAME}`
  ownerUrl = url.toString()
  owner = new pg.Client({ connectionString: url.toString() })
  await owner.connect()

  // The folder as one script. `--> statement-breakpoint` is a SQL comment, so this leaves the same
  // catalogue the kernel's migrator does; the *replay* behaviour is `migrations.test.ts`'s job.
  const journal = JSON.parse(readFileSync(join(MIGRATIONS, 'meta/_journal.json'), 'utf8')) as {
    entries: Array<{ idx: number; tag: string }>
  }
  for (const entry of [...journal.entries].sort((a, b) => a.idx - b.idx)) {
    await owner.query(readFileSync(join(MIGRATIONS, `${entry.tag}.sql`), 'utf8'))
  }

  await owner.query(`create role "${RLS_ROLE}" login password 'probe' nosuperuser nobypassrls`)
  await owner.query(`grant usage on schema mod_meet to "${RLS_ROLE}"`)
  await owner.query(`grant select, insert, update, delete on all tables in schema mod_meet to "${RLS_ROLE}"`)

  const asProbe = new URL(url.toString())
  asProbe.username = RLS_ROLE
  asProbe.password = 'probe'
  probeUrl = asProbe.toString()
  plain = new pg.Client({ connectionString: probeUrl })
  await plain.connect()
}, 120_000)

afterAll(async () => {
  await plain?.end().catch(() => undefined)
  await owner?.end().catch(() => undefined)
  await admin?.query(`drop database if exists "${DB_NAME}" with (force)`).catch(() => undefined)
  await admin?.query(`drop role if exists "${RLS_ROLE}"`).catch(() => undefined)
  await admin?.end().catch(() => undefined)
}, 60_000)

/**
 * `false` is load-bearing: the third argument is `is_local`, and a *local* setting lasts only for the
 * current transaction — which, for an implicit single-statement one, is already over by the next
 * query. Set it locally and every assertion below passes vacuously, against a session that has no
 * workspace at all and can therefore see nothing.
 */
const bind = (value: string) => plain.query(`select set_config('app.workspace_id', $1, false)`, [value])

/** The connection string for the probe role, so a test can open one of its own. */
let probeUrl = ''

/**
 * A **fresh** connection as the probe role, which has never bound a workspace — the state a job that
 * forgot its `withWorkspace` is in, and the only way to reach it.
 *
 * Measured on Postgres 18.3 rather than assumed: once a custom GUC has been set in a session there
 * is no way back to NULL. `reset "app.workspace_id"` and `set_config('app.workspace_id', null,
 * false)` both leave it as the **empty string**, and `current_setting(…, true)` then returns `''`
 * rather than NULL. That matters because the two are not the same test: a policy carrying an
 * accidental `current_setting('app.workspace_id', true) is null or …` arm — which is exactly the
 * "an unbound transaction may read everything" defect these policies are shaped to avoid — is
 * invisible to a session holding `''`. Reusing the bound connection here passed against a policy
 * deliberately broken that way; this does not.
 */
async function freshUnboundClient(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: probeUrl })
  await client.connect()
  const { rows } = await client.query<{ unset: boolean }>(
    `select current_setting('app.workspace_id', true) is null as unset`,
  )
  // The guard on this guard: if a future Postgres pre-seeds the setting, every assertion made
  // through this connection would be about something other than an unbound session.
  expect(rows[0]?.unset, 'this connection was supposed to have no workspace bound at all').toBe(true)
  return client
}

describe('the probe is a role that policies actually apply to', () => {
  it('is neither a superuser nor able to bypass row-level security', async () => {
    // Asserted rather than assumed. Every assertion in this file is worthless if this is not true,
    // and it is exactly the assumption that let a module ship with no policies at all.
    const { rows } = await plain.query<{ super: boolean; bypass: boolean; name: string }>(
      `select rolname as name, rolsuper as super, rolbypassrls as bypass
         from pg_roles where rolname = current_user`,
    )
    expect(rows[0]).toEqual({ name: RLS_ROLE, super: false, bypass: false })
  })

  it('is not the owner of the tables it is reading, so `force` is not what is being tested here', async () => {
    const { rows } = await plain.query<{ owner: string }>(
      `select tableowner as owner from pg_tables where schemaname = 'mod_meet' limit 1`,
    )
    expect(rows[0]?.owner).not.toBe(RLS_ROLE)
  })
})

/**
 * One row in **every** tenant table, for each of two workspaces.
 *
 * All four tables on purpose. Seeding only `rooms` and `meetings` made the loop over
 * `TENANT_TABLES` below pass for the wrong reason: with no rows in `participants` or `invites`, an
 * unbound session counts zero whether or not those tables carry a policy at all. Removing the
 * `invites` policy and watching this file stay green is how that was found, which is the same shape
 * as every other vacuous assertion in this project — a check over an empty set.
 */
async function seedWorkspace(workspaceId: string, roomId: string, tag: string) {
  // Through the probe role itself, bound to the workspace — so `with check` is exercised on the way
  // in rather than rows being handed over by a superuser that never met a policy.
  await bind(workspaceId)
  await plain.query(`insert into mod_meet.rooms (id, workspace_id, slug, name) values ($1,$2,$3,$3)`, [
    roomId,
    workspaceId,
    tag,
  ])
  const { rows } = await plain.query<{ id: string }>(
    `insert into mod_meet.meetings (workspace_id, kind, livekit_room, room_id, started_by)
     values ($1,'room',$2,$3,$4) returning id`,
    [workspaceId, `iso-${tag}`, roomId, USER],
  )
  const meetingId = rows[0]!.id
  await plain.query(
    `insert into mod_meet.participants (workspace_id, meeting_id, user_id) values ($1,$2,$3)`,
    [workspaceId, meetingId, USER],
  )
  await plain.query(
    `insert into mod_meet.invites (workspace_id, meeting_id, from_user_id, to_user_id, expires_at)
     values ($1,$2,$3,$3, now() + interval '45 seconds')`,
    [workspaceId, meetingId, USER],
  )
}

describe('two workspaces, one database', () => {
  beforeAll(async () => {
    await seedWorkspace(WS_A, ROOM_A, 'a')
    await seedWorkspace(WS_B, ROOM_B, 'b')
  })

  it('put one row in every tenant table, so nothing below passes over an empty set', async () => {
    // Asserted rather than assumed: this is the guard on the guards. A table that stops being
    // seeded makes every isolation assertion about it vacuously true.
    await bind('*')
    for (const table of TENANT_TABLES) {
      const { rows } = await plain.query<{ n: number }>(`select count(*)::int as n from mod_meet."${table}"`)
      expect(rows[0]?.n, `mod_meet.${table} was not seeded`).toBe(2)
    }
  })

  it('shows each workspace exactly its own row in every tenant table', async () => {
    for (const workspaceId of [WS_A, WS_B]) {
      await bind(workspaceId)
      for (const table of TENANT_TABLES) {
        const { rows } = await plain.query<{ n: number; mine: number }>(
          `select count(*)::int as n,
                  count(*) filter (where workspace_id = $1)::int as mine
             from mod_meet."${table}"`,
          [workspaceId],
        )
        // Both halves: it sees the other workspace's row (n > 1), and it sees nothing of its own
        // (mine = 0) — the second is what stops a policy that refuses everything passing this.
        expect({ table, workspaceId, ...rows[0] }).toEqual({ table, workspaceId, n: 1, mine: 1 })
      }
    }
  })

  it('shows each workspace only its own rooms', async () => {
    await bind(WS_A)
    const a = await plain.query<{ slug: string }>(`select slug from mod_meet.rooms order by slug`)
    expect(a.rows.map((r) => r.slug)).toEqual(['a'])

    await bind(WS_B)
    const b = await plain.query<{ slug: string }>(`select slug from mod_meet.rooms order by slug`)
    expect(
      b.rows.map((r) => r.slug),
      'and it is not simply seeing nothing',
    ).toEqual(['b'])
  })

  it("hides A's rows from B even when B names A's id directly", async () => {
    // The shape every cross-tenant bug has: a query whose `where` is only `eq(table.id, input.id)`.
    await bind(WS_B)
    const room = await plain.query<{ n: number }>(
      `select count(*)::int as n from mod_meet.rooms where id = $1`,
      [ROOM_A],
    )
    expect(room.rows[0]?.n).toBe(0)
    const meeting = await plain.query<{ n: number }>(
      `select count(*)::int as n from mod_meet.meetings where livekit_room = 'iso-a'`,
    )
    expect(meeting.rows[0]?.n).toBe(0)
  })

  it("refuses to mutate A's rows from a session bound to B", async () => {
    await bind(WS_B)
    const updated = await plain.query(`update mod_meet.rooms set name = 'seized' where id = $1`, [ROOM_A])
    expect(updated.rowCount, "B's UPDATE reached a row in A").toBe(0)

    await bind(WS_A)
    const { rows } = await plain.query<{ name: string }>(`select name from mod_meet.rooms where id = $1`, [
      ROOM_A,
    ])
    expect(rows[0]?.name, "A's room kept the name it was seeded with").toBe('a')
  })

  it("refuses to write a row into A's workspace from a session bound to B", async () => {
    // `with check`, which is the arm an `update … set workspace_id` and a mislabelled insert hit.
    await bind(WS_B)
    await expect(
      plain.query(`insert into mod_meet.rooms (workspace_id, slug, name) values ($1,'smuggled','X')`, [WS_A]),
    ).rejects.toThrow(/row-level security/)
  })

  it("refuses to move one of B's own rows into A", async () => {
    await bind(WS_B)
    await expect(
      plain.query(`update mod_meet.rooms set workspace_id = $1 where id = $2`, [WS_A, ROOM_B]),
    ).rejects.toThrow(/row-level security/)
  })
})

describe('the two arms of every policy', () => {
  it('shows a session with nothing bound nothing at all, on every tenant table', async () => {
    /*
     * The refusal that makes forgetting to bind safe.
     *
     * A policy admitting an *unbound* transaction would turn a job that forgot its `withWorkspace`
     * into a cross-tenant read rather than an empty result — and forgetting is the failure that
     * actually happens. `current_setting('app.workspace_id', true)` is NULL when nothing is bound,
     * so both arms evaluate to NULL and neither admits anything.
     */
    const unbound = await freshUnboundClient()
    try {
      for (const table of TENANT_TABLES) {
        const { rows } = await unbound.query<{ n: number }>(
          `select count(*)::int as n from mod_meet."${table}"`,
        )
        expect(rows[0]?.n, `mod_meet.${table} was readable with no workspace bound`).toBe(0)
      }
    } finally {
      await unbound.end().catch(() => undefined)
    }
  })

  it('refuses a write from a session with nothing bound', async () => {
    const unbound = await freshUnboundClient()
    try {
      await expect(
        unbound.query(`insert into mod_meet.rooms (workspace_id, slug, name) values ($1,'unbound','X')`, [
          WS_A,
        ]),
      ).rejects.toThrow(/row-level security/)
    } finally {
      await unbound.end().catch(() => undefined)
    }
  })

  it('shows a session bound to the empty string nothing either', async () => {
    // The other shape of "nothing useful bound", and a different one in SQL: `''` is a value, so
    // `is null` is false and both arms compare a real string. Both have to be refusals, and only a
    // fresh connection can test the NULL one — see `freshUnboundClient`.
    await bind('')
    for (const table of TENANT_TABLES) {
      const { rows } = await plain.query<{ n: number }>(`select count(*)::int as n from mod_meet."${table}"`)
      expect(rows[0]?.n, `mod_meet.${table} was readable with an empty workspace binding`).toBe(0)
    }
  })

  it("shows the star sentinel every workspace's rows, which is what the webhook and the sweeps need", async () => {
    /*
     * The other arm, and the reason it is a literal `'*'` rather than "no binding": binding the
     * sentinel is something a job does on purpose and can be grepped for, where an unbound
     * transaction is something that happens by omission.
     *
     * Nothing in this module binds it yet — the LiveKit webhook and the reconciler arrive later —
     * so this asserts the arm exists and works, not that anything uses it.
     */
    await bind('*')
    const { rows } = await plain.query<{ slug: string }>(`select slug from mod_meet.rooms order by slug`)
    expect(rows.map((r) => r.slug)).toEqual(['a', 'b'])
  })

  it('lets the star sentinel write a row for a workspace it is not bound to', async () => {
    // Exactly what the LiveKit webhook does: it is handed a room name and a signature, finds the
    // meeting, and writes attendance into a workspace it was never told about.
    const OTHER_USER = '00000000-0000-4000-8000-00000000cc02'
    await bind('*')
    await plain.query(
      `insert into mod_meet.participants (workspace_id, meeting_id, user_id)
       select workspace_id, id, $1 from mod_meet.meetings where livekit_room = 'iso-a'`,
      [OTHER_USER],
    )
    await bind(WS_A)
    const seen = await plain.query<{ n: number }>(
      `select count(*)::int as n from mod_meet.participants where user_id = $1`,
      [OTHER_USER],
    )
    expect(seen.rows[0]?.n, 'the row the webhook would have written is visible to its own workspace').toBe(1)
    await bind(WS_B)
    const other = await plain.query<{ n: number }>(
      `select count(*)::int as n from mod_meet.participants where user_id = $1`,
      [OTHER_USER],
    )
    expect(other.rows[0]?.n, 'and to nobody else').toBe(0)
  })
})

/**
 * The same question asked of the router, which is the thing a person actually reaches.
 *
 * A LiveKit token is a bearer credential scoped to one room name, so "can A get a token for B's
 * meeting" is not a database question at all — the row could stay perfectly invisible to A while a
 * handler happily minted a token for a room name it took from the request. Every assertion here
 * therefore reads the **token that came back**, or the error that came back instead of one.
 *
 * It runs a real kernel over the same scratch database, with core stubbed at the broker: that is
 * what makes `workspaceScoped`, `requiresCapability` and `requires` the real middlewares rather than
 * three functions a test agreed to believe in.
 */
describe('the router, and who may get a token out of it', () => {
  let kernel: Kernel
  let meet: ReturnType<typeof meetRouter>
  let meetingA = ''
  let meetingB = ''

  /** What core is pretending each workspace has switched on. `null` = never touched the switchboard. */
  const capabilities = new Map<string, Record<string, boolean>>()

  const principal = (userId: string, workspaceId: string): Principal =>
    ({
      kind: 'user',
      userId,
      email: `${userId}@example.test`,
      name: 'Ada Lovelace',
      locale: 'en',
      instanceAdmin: false,
      service: null,
      memberships: [{ workspaceId, role: 'admin', roleIds: [], groupIds: [], status: 'active' }],
      permissionVersion: 0,
    }) as unknown as Principal

  const asUser = (workspaceId: string): RequestContext => ({
    kernel,
    principal: principal(USER, workspaceId),
    requestId: 'test',
    ip: '127.0.0.1',
    headers: {},
  })

  /**
   * The code an oRPC refusal actually carried.
   *
   * Asserting on a message would pass for any failure, a typo in the input included — and the whole
   * distinction being made here is between two refusals that both stop the call.
   */
  const refusedWith = async (fn: () => Promise<unknown>): Promise<string> => {
    try {
      await fn()
      return 'no error'
    } catch (error) {
      const e = error as { code?: string; cause?: { code?: string } }
      return e.code ?? e.cause?.code ?? String(error)
    }
  }

  /** Switch a workspace's capabilities for one block. The settings cache is 15s, so invalidate. */
  async function withCapabilities(workspaceId: string, on: Record<string, boolean>, fn: () => Promise<void>) {
    capabilities.set(workspaceId, on)
    kernel.settings.invalidate(workspaceId)
    try {
      await fn()
    } finally {
      capabilities.delete(workspaceId)
      kernel.settings.invalidate(workspaceId)
    }
  }

  beforeAll(async () => {
    // The router reads the environment once, when it is built — so this is set before, not after.
    process.env.LIVEKIT_URL = 'ws://livekit:7880'
    process.env.LIVEKIT_API_KEY = 'kern'
    process.env.LIVEKIT_API_SECRET = 'an-isolation-test-secret-long-enough'

    kernel = await createKernel({
      service: 'meet-isolation-test',
      modules: [meetModule],
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
      'settings.getModule': {
        handler: async (input: { workspaceId: string }) => {
          const on = capabilities.get(input.workspaceId)
          return on ? { [CAPABILITIES_KEY]: on } : {}
        },
      },
      'settings.setModule': { handler: async () => ({ ok: true }) },
    })
    await kernel.start()
    meet = meetRouter(kernel)

    const { rows } = await owner.query<{ id: string; livekit_room: string }>(
      `select id, livekit_room from mod_meet.meetings order by livekit_room`,
    )
    meetingA = rows.find((r) => r.livekit_room === 'iso-a')!.id
    meetingB = rows.find((r) => r.livekit_room === 'iso-b')!.id
  }, 180_000)

  afterAll(async () => {
    await kernel?.stop().catch(() => undefined)
    for (const key of ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET']) delete process.env[key]
  })

  /**
   * `calls` on for both workspaces, which is the only state in which a token is obtainable at all.
   * Without this every assertion below would be a 404 for the wrong reason.
   */
  const withCalls = (fn: () => Promise<void>) =>
    withCapabilities(WS_A, { calls: true }, () => withCapabilities(WS_B, { calls: true }, fn))

  it('gives a member of A a token for A’s own meeting — the control', async () => {
    await withCalls(async () => {
      const joined = await call(
        meet.meetings.join,
        { workspaceId: WS_A, meetingId: meetingA },
        { context: asUser(WS_A) },
      )
      // The room in the grant, not merely "a token came back": a token is only as scoped as its
      // room claim, and this is the claim every other assertion in this block is the absence of.
      const grant = JSON.parse(Buffer.from(joined.token.split('.')[1]!, 'base64url').toString('utf8')) as {
        video?: { room?: string }
        sub?: string
      }
      expect(grant.video?.room).toBe(joined.meeting.livekitRoom)
      expect(grant.sub).toBe(USER)
    })
  })

  it('refuses a member of A a token for B’s meeting, with 404 rather than 403', async () => {
    /*
     * The assertion this whole file exists for, in its router form.
     *
     * **404, not 403.** A `FORBIDDEN` would confirm that the id the caller named is a real meeting
     * somewhere on the instance, which is precisely the fact a cross-tenant refusal must not carry.
     * The transaction is workspace-bound and `openMeetingById` names `workspace_id` in its
     * predicate, so from A the row is not merely off-limits — it does not exist.
     */
    await withCalls(async () => {
      expect(
        await refusedWith(() =>
          call(meet.meetings.join, { workspaceId: WS_A, meetingId: meetingB }, { context: asUser(WS_A) }),
        ),
      ).toBe('NOT_FOUND')
    })
  })

  it('refuses even when the caller claims B’s workspace as well as B’s meeting', async () => {
    // The other half of the same attempt: name the workspace the row really is in. `workspaceScoped`
    // asks for a membership in it, and this principal has none.
    await withCalls(async () => {
      expect(
        await refusedWith(() =>
          call(meet.meetings.join, { workspaceId: WS_B, meetingId: meetingB }, { context: asUser(WS_A) }),
        ),
        'a member of A is not a member of B',
      ).not.toBe('no error')
    })
  })

  /**
   * The safety property the release turns on: a workspace that has touched nothing.
   *
   * `isEnabled` in core answers `row?.enabled ?? true`, so `meet` is switched **on** in every
   * workspace on every instance the night this rolls out. Both capabilities default to off and
   * neither is `required`, which is the only thing standing between that and a Meetings item that
   * appears unannounced and fails on click.
   */
  describe('a workspace that has touched nothing on the switchboard', () => {
    it('answers 404 from a meetings procedure, not 403', async () => {
      // No `withCapabilities` at all — core answers `{}`, exactly as it does for a workspace whose
      // administrator has never opened Settings → Modules.
      expect(capabilities.has(WS_A), 'this test is about the untouched state').toBe(false)
      kernel.settings.invalidate(WS_A)
      expect(
        await refusedWith(() =>
          call(meet.meetings.join, { workspaceId: WS_A, meetingId: meetingA }, { context: asUser(WS_A) }),
        ),
      ).toBe('NOT_FOUND')
      expect(
        await refusedWith(() => call(meet.meetings.start, { workspaceId: WS_A }, { context: asUser(WS_A) })),
      ).toBe('NOT_FOUND')
    })

    it('still answers config.get, which is how an administrator finds out why', async () => {
      /*
       * The deliberate exception, and the reason there is one. This is the question somebody asks
       * *because* meetings do not work; gated on `calls` it would answer 404 to the only person who
       * needed it. `configured` and `reachable` stay separate — `reachable` is false here because
       * nothing is listening on `livekit:7880` from a test runner, which is itself the honest answer.
       */
      kernel.settings.invalidate(WS_A)
      const config = await call(meet.config.get, { workspaceId: WS_A }, { context: asUser(WS_A) })
      expect(config.configured, 'a secret is set in this test’s environment').toBe(true)
      expect(config.mediaUrl).toBe('ws://livekit:7880')
      expect(typeof config.reachable).toBe('boolean')
      expect(config.maxParticipants, 'the default, from a workspace that saved no settings').toBe(20)
    })

    it('starts answering the moment an administrator switches calls on', async () => {
      // The other direction, so the 404s above are shown to be the capability and not something
      // else refusing for its own reasons.
      await withCalls(async () => {
        const joined = await call(
          meet.meetings.join,
          { workspaceId: WS_A, meetingId: meetingA },
          { context: asUser(WS_A) },
        )
        expect(joined.token.length).toBeGreaterThan(0)
        expect(joined.expiresIn).toBe(600)
      })
    })
  })
})
