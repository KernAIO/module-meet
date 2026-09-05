import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
 * There is no service layer to test yet: this module mounts no router. What is asserted here is the
 * last line rather than the first — that a session bound to one workspace cannot read or write
 * another's rows whatever a query's `where` clause says.
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

beforeAll(async () => {
  admin = new pg.Client({ connectionString: BASE_URL })
  await admin.connect()
  await admin.query(`create database "${DB_NAME}"`)

  const url = new URL(BASE_URL)
  url.pathname = `/${DB_NAME}`
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
