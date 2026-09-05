import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createKernel, type Kernel } from '@kernhq/kernel'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { meetModule } from './index.js'
import { TENANT_TABLES } from './schema.js'

/**
 * The migration folder, applied to a database created from nothing — and then applied again.
 *
 * The second pass is the point. A module's migrations are the first thing the kernel runs, so a
 * migration that throws does not degrade meetings: the host service never binds its port and every
 * other module in it goes down too. `core` hosts five today, so a replay failure here is an outage
 * for the tracker, the wiki, HR, billing and inventory. And a replay is routine rather than exotic —
 * drizzle keys applied migrations by content hash, so editing any file in this folder makes the
 * whole folder run again against a schema that already has its objects.
 *
 * Four things here are deliberate, and each is a way this test could have been vacuously green:
 *
 * 1. **A scratch database, created here.** Running against a database somebody has already migrated
 *    proves nothing — the same shape of mistake as asserting that `migrateModule` succeeds twice,
 *    which it does by reading `__migrations` and returning.
 * 2. **Every statement is executed separately and every failure is collected**, rather than throwing
 *    on the first. Guarding one class of statement and re-running tells you only about the next one;
 *    collecting them says how much is actually unguarded.
 * 3. **Policies are asserted as `(tablename, policyname)` pairs, not as a count per table.** A table
 *    may legitimately carry several, and a duplicate pair is exactly what a replay produces.
 * 4. **The catalogue is asked which tables are unsecured, rather than a list being read back.** A
 *    table added to the schema and forgotten in `0001_rls.sql` fails here by name; a list compared
 *    only with itself would agree with itself.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = join(HERE, '../../migrations')

const BASE_URL = process.env.DATABASE_URL ?? 'postgres://kern:kern@localhost:5432/kern'
const DB_NAME = `kern_meet_replay_${Date.now().toString(36)}`

let admin: pg.Client
let db: pg.Client

/** The folder in the order the kernel applies it — by filename, which is why they are numbered. */
function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

/**
 * Apply one file statement by statement, returning every failure rather than the first.
 *
 * `--> statement-breakpoint` is drizzle's separator. Splitting on it is also why nothing in this
 * folder may use a dollar-quoted body: a breakpoint inside `do $$ … end $$` cuts the function in
 * half, and the error is `unterminated dollar-quoted string`, which does not sound like what it is.
 */
async function apply(
  file: string,
  client: pg.Client = db,
): Promise<Array<{ statement: string; error: string }>> {
  const sql = readFileSync(join(MIGRATIONS, file), 'utf8')
  const failures: Array<{ statement: string; error: string }> = []
  for (const raw of sql.split('--> statement-breakpoint')) {
    const statement = raw.trim()
    if (!statement || statement.split('\n').every((l) => l.trim().startsWith('--'))) continue
    try {
      await client.query(statement)
    } catch (err) {
      failures.push({
        statement: statement.slice(0, 120).replace(/\s+/g, ' '),
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return failures
}

beforeAll(async () => {
  admin = new pg.Client({ connectionString: BASE_URL })
  await admin.connect()
  await admin.query(`create database "${DB_NAME}"`)
  const url = new URL(BASE_URL)
  url.pathname = `/${DB_NAME}`
  db = new pg.Client({ connectionString: url.toString() })
  await db.connect()
}, 120_000)

afterAll(async () => {
  await db?.end().catch(() => undefined)
  await admin?.query(`drop database if exists "${DB_NAME}" with (force)`).catch(() => undefined)
  await admin?.end().catch(() => undefined)
})

describe('the migration folder', () => {
  it('applies to a database created from nothing', async () => {
    // Created from nothing on purpose: `module-inventory` shipped an exclusion constraint that
    // needed `btree_gist` and worked on every database it had ever met, because every one of them
    // already had the extension. Nothing here needs an extension — `uuidv7()` is built in from
    // Postgres 18 — and this is what proves it rather than assuming it.
    for (const file of migrationFiles()) {
      expect(await apply(file), `${file}, first pass`).toEqual([])
    }
  })

  it('applies a second time, because a replay must not take down the host service', async () => {
    for (const file of migrationFiles()) {
      expect(await apply(file), `${file}, replay`).toEqual([])
    }
  })

  it('leaves exactly one of every policy after the replay', async () => {
    const { rows } = await db.query<{ tablename: string; policyname: string }>(
      `select tablename, policyname from pg_policies where schemaname = 'mod_meet'`,
    )
    const seen = rows.map((r) => `${r.tablename}.${r.policyname}`)
    expect([...new Set(seen)].sort(), 'a duplicate pair is what a replay produces').toEqual(seen.sort())
    for (const table of TENANT_TABLES)
      expect(seen, `mod_meet.${table} has its policy`).toContain(`${table}.${table}_ws_isolation`)
    expect(seen, 'and no policy this module did not write').toHaveLength(TENANT_TABLES.length)
  })

  it('secures every table that carries a workspace column, and forces it', async () => {
    /*
     * Asked of the catalogue rather than of a list. `TENANT_TABLES` is what the RLS migration was
     * written against, so comparing the migration to it would be comparing a claim with itself: a
     * table added to `schema.ts` and forgotten in both places would pass. This asks Postgres which
     * tables in `mod_meet` have a `workspace_id` column, and holds *those* to a forced policy —
     * which is the question that found `mod_mail` with no row-level security on any table at all.
     *
     * `force` is the half that is easy to lose. Without it the table's owner — which is the role the
     * service connects as — is exempt from its own policies, so every policy here would be
     * decorative in the one deployment that matters.
     */
    const { rows } = await db.query<{ relname: string; rls: boolean; forced: boolean; policies: number }>(
      `select c.relname,
              c.relrowsecurity as rls,
              c.relforcerowsecurity as forced,
              (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'mod_meet'
          and c.relkind in ('r', 'p')
          and exists (select 1 from pg_attribute a
                       where a.attrelid = c.oid and a.attname = 'workspace_id' and not a.attisdropped)
        order by c.relname`,
    )
    expect(rows.length, 'no tenant table found at all — the schema did not build').toBeGreaterThan(0)
    const unsecured = rows.filter((r) => !r.rls || !r.forced || r.policies === 0).map((r) => r.relname)
    expect(unsecured, 'tenant tables in mod_meet without a forced policy').toEqual([])
    expect(
      rows.map((r) => r.relname).sort(),
      'the catalogue and TENANT_TABLES describe the same set',
    ).toEqual([...TENANT_TABLES].sort())
  })

  it('gives every policy both arms of the binding, and no third one', async () => {
    /*
     * The *text* of every policy, which is the one thing this file can say about it: whether each
     * arm admits the star sentinel and the workspace binding, and nothing else.
     *
     * What it deliberately does not claim is that the policies *work*. The role running this test is
     * whatever `DATABASE_URL` names, and a superuser bypasses row-level security entirely — so an
     * assertion here about what a session can see would pass just as happily against tables carrying
     * no policy at all. That question is asked in `isolation.test.ts`, under an explicit
     * `nosuperuser nobypassrls` role, which is the only role that can tell a working policy from a
     * missing one.
     */
    const { rows } = await db.query<{ tablename: string; qual: string; withcheck: string; cmd: string }>(
      `select tablename, qual, with_check as withcheck, cmd from pg_policies
        where schemaname = 'mod_meet' order by tablename`,
    )
    expect(rows).toHaveLength(TENANT_TABLES.length)
    for (const row of rows) {
      expect(row.cmd, `${row.tablename}: one policy covering every command`).toBe('ALL')
      for (const [arm, text] of [
        ['using', row.qual],
        ['with check', row.withcheck],
      ] as const) {
        expect(text, `${row.tablename}.${arm} admits the star sentinel`).toContain(`'*'`)
        expect(text, `${row.tablename}.${arm} admits its own workspace`).toContain('app.workspace_id')
        // A `with check` Postgres reports as null is a policy that lets any row be written.
        expect(text, `${row.tablename} must not leave an arm empty`).toBeTruthy()
      }
    }
  })
})

/**
 * The three partial unique indexes that carry this module's invariants.
 *
 * Each is asserted twice: that Postgres built the index, and that it actually refuses the row it
 * exists to refuse. The second half is what stops this being a test about a `pg_indexes` string —
 * a partial index with the predicate the wrong way round is present, correctly named, and enforces
 * the opposite of what was meant.
 */
describe('the invariants the schema enforces rather than intends', () => {
  const WS = '00000000-0000-4000-8000-0000000000a1'
  const OTHER_WS = '00000000-0000-4000-8000-0000000000a2'
  const ROOM = '00000000-0000-4000-8000-0000000000b1'
  const USER = '00000000-0000-4000-8000-0000000000c1'

  /** `'*'` so these inserts pass the policies; the owner is subject to them because of `force`. */
  beforeAll(async () => {
    await db.query(`select set_config('app.workspace_id', '*', false)`)
    await db.query(
      `insert into mod_meet.rooms (id, workspace_id, slug, name) values ($1,$2,'standup','Standup')`,
      [ROOM, WS],
    )
  })

  it('allows one live meeting in a room and refuses a second', async () => {
    await db.query(
      `insert into mod_meet.meetings (workspace_id, kind, livekit_room, room_id, started_by)
       values ($1,'room','meet-room-1',$2,$3)`,
      [WS, ROOM, USER],
    )
    await expect(
      db.query(
        `insert into mod_meet.meetings (workspace_id, kind, livekit_room, room_id, started_by)
         values ($1,'room','meet-room-2',$2,$3)`,
        [WS, ROOM, USER],
      ),
      'two people entering one room must land in one meeting',
    ).rejects.toThrow(/meet_meetings_room_live_uq/)
  })

  it('allows the next meeting in that room once the first has ended', async () => {
    // Partial, not total: a room holds a thousand past meetings and at most one present one. A total
    // unique index on `room_id` would refuse the second standup ever held.
    await db.query(
      `update mod_meet.meetings set ended_at = now(), ended_reason = 'empty' where room_id = $1`,
      [ROOM],
    )
    await db.query(
      `insert into mod_meet.meetings (workspace_id, kind, livekit_room, room_id, started_by)
       values ($1,'room','meet-room-3',$2,$3)`,
      [WS, ROOM, USER],
    )
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from mod_meet.meetings where room_id = $1`,
      [ROOM],
    )
    expect(rows[0]?.n).toBe(2)
  })

  it('allows one live huddle per object and refuses a second', async () => {
    // The index that makes two people pressing Huddle in the same second land in one call: the
    // second insert loses on a unique violation rather than opening a second room.
    await db.query(
      `insert into mod_meet.meetings
         (workspace_id, kind, livekit_room, object_module, object_type, object_id, started_by)
       values ($1,'huddle','meet-huddle-1','chat','channel','c-design',$2)`,
      [WS, USER],
    )
    await expect(
      db.query(
        `insert into mod_meet.meetings
           (workspace_id, kind, livekit_room, object_module, object_type, object_id, started_by)
         values ($1,'huddle','meet-huddle-2','chat','channel','c-design',$2)`,
        [WS, USER],
      ),
    ).rejects.toThrow(/meet_meetings_object_live_uq/)
  })

  it('scopes that huddle invariant to one workspace', async () => {
    // `object_id` is another module's identifier and this module cannot promise it is unique across
    // workspaces, so the index carries `workspace_id`. Without it, one workspace's live huddle would
    // block another workspace's.
    await db.query(
      `insert into mod_meet.meetings
         (workspace_id, kind, livekit_room, object_module, object_type, object_id, started_by)
       values ($1,'huddle','meet-huddle-3','chat','channel','c-design',$2)`,
      [OTHER_WS, USER],
    )
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from mod_meet.meetings where object_id = 'c-design' and ended_at is null`,
    )
    expect(rows[0]?.n).toBe(2)
  })

  it('leaves direct calls out of the huddle index entirely', async () => {
    // Two direct calls have no object at all. Postgres treats nulls as distinct in a unique index,
    // so they would not collide anyway; the `object_id is not null` predicate says the invariant is
    // about huddles rather than resting on that.
    for (const room of ['meet-direct-1', 'meet-direct-2']) {
      await db.query(
        `insert into mod_meet.meetings (workspace_id, kind, livekit_room, started_by)
         values ($1,'direct',$2,$3)`,
        [WS, room, USER],
      )
    }
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from mod_meet.meetings where kind = 'direct'`,
    )
    expect(rows[0]?.n).toBe(2)
  })

  it('allows one live participant row per person per meeting and refuses a second', async () => {
    // What lets the webhook insert with `on conflict do nothing`: LiveKit retries any delivery it
    // did not get a 2xx for, so the same `participant_joined` arrives twice as a matter of routine.
    const { rows } = await db.query<{ id: string }>(
      `select id from mod_meet.meetings where livekit_room = 'meet-direct-1'`,
    )
    const meetingId = rows[0]!.id
    await db.query(
      `insert into mod_meet.participants (workspace_id, meeting_id, user_id) values ($1,$2,$3)`,
      [WS, meetingId, USER],
    )
    await expect(
      db.query(`insert into mod_meet.participants (workspace_id, meeting_id, user_id) values ($1,$2,$3)`, [
        WS,
        meetingId,
        USER,
      ]),
    ).rejects.toThrow(/meet_participants_live_uq/)

    // And a rejoin after leaving is a second row, not a refusal — which is what keeps an occupancy
    // count a count rather than an over-count for somebody on a flaky connection.
    await db.query(`update mod_meet.participants set left_at = now() where meeting_id = $1`, [meetingId])
    await db.query(
      `insert into mod_meet.participants (workspace_id, meeting_id, user_id) values ($1,$2,$3)`,
      [WS, meetingId, USER],
    )
    const again = await db.query<{ n: number }>(
      `select count(*)::int as n from mod_meet.participants where meeting_id = $1`,
      [meetingId],
    )
    expect(again.rows[0]?.n).toBe(2)
  })

  it('refuses a meeting kind and an invite state the contract does not name', async () => {
    // Both checks live inside `create table`, where they inherit its `if not exists` — an
    // `alter table … add constraint` would need a drop in front of it to survive the replay above.
    await expect(
      db.query(
        `insert into mod_meet.meetings (workspace_id, kind, livekit_room, started_by)
         values ($1,'webinar','meet-bad-1',$2)`,
        [WS, USER],
      ),
    ).rejects.toThrow(/meet_meetings_kind_ck/)

    const { rows } = await db.query<{ id: string }>(
      `select id from mod_meet.meetings where livekit_room = 'meet-direct-2'`,
    )
    await expect(
      db.query(
        `insert into mod_meet.invites (workspace_id, meeting_id, from_user_id, to_user_id, state, expires_at)
         values ($1,$2,$3,$3,'snoozed', now() + interval '45 seconds')`,
        [WS, rows[0]!.id, USER],
      ),
    ).rejects.toThrow(/meet_invites_state_ck/)
  })
})

/**
 * The folder applied by the **kernel's own migrator**, which is what a host service actually runs.
 *
 * Everything above splits the SQL on `--> statement-breakpoint` and executes the pieces, which is
 * the right way to find out which statements are unguarded and the wrong way to prove a host will
 * boot: it never reads `meta/_journal.json`, never hashes a file, and never writes `__migrations`.
 * A journal entry naming a `.sql` that is not there, or a tag that does not match its file, is
 * invisible to it and fatal at boot — and a module's migrations run before the host binds its port,
 * so the symptom is `core` not answering at all rather than meetings being broken.
 *
 * `pnpm build` is not this either: TypeScript never opens the migrations folder.
 */
describe('a host service booting with this module', () => {
  const BOOT_DB = `${DB_NAME}_boot`
  let kernel: Kernel
  let booted: pg.Client

  beforeAll(async () => {
    await admin.query(`create database "${BOOT_DB}"`)
    const url = new URL(BASE_URL)
    url.pathname = `/${BOOT_DB}`
    kernel = await createKernel({
      service: 'meet-migration-test',
      modules: [meetModule],
      role: 'api',
      env: {
        DATABASE_URL: url.toString(),
        KERN_SECRET: 'test-secret-that-is-long-enough-for-kern',
        NODE_ENV: 'test',
        NATS_URL: undefined,
        VALKEY_URL: undefined,
      },
    })
    await kernel.start()
    booted = new pg.Client({ connectionString: url.toString() })
    await booted.connect()
  }, 180_000)

  afterAll(async () => {
    await booted?.end().catch(() => undefined)
    await kernel?.stop().catch(() => undefined)
    await admin?.query(`drop database if exists "${BOOT_DB}" with (force)`).catch(() => undefined)
  }, 60_000)

  it('builds every table this module owns', async () => {
    const { rows } = await booted.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'mod_meet' and c.relkind = 'r' and c.relname <> '__migrations'
        order by c.relname`,
    )
    expect(rows.map((r) => r.relname)).toEqual([...TENANT_TABLES].sort())
  })

  it('records every journal entry as applied, so none was silently skipped', async () => {
    const journal = JSON.parse(readFileSync(join(MIGRATIONS, 'meta/_journal.json'), 'utf8')) as {
      entries: Array<{ when: number; tag: string }>
    }
    const { rows } = await booted.query<{ created_at: string }>(
      `select created_at from mod_meet.__migrations order by created_at`,
    )
    // `created_at` is the journal's `when`, which is exactly the value drizzle compares against —
    // so this is the assertion that a `when` below its predecessor would break on a database that
    // already existed. On a fresh one it only proves nothing was dropped.
    expect(rows.map((r) => String(r.created_at))).toEqual(journal.entries.map((e) => String(e.when)))
  })

  it('leaves every policy in place, applied the way a host applies them', async () => {
    const { rows } = await booted.query<{ tablename: string; policyname: string }>(
      `select tablename, policyname from pg_policies where schemaname = 'mod_meet' order by tablename`,
    )
    expect(rows.map((r) => `${r.tablename}.${r.policyname}`)).toEqual(
      [...TENANT_TABLES].sort().map((t) => `${t}.${t}_ws_isolation`),
    )
  })
})
