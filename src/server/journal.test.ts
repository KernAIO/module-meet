import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The journal's `when` values must increase with the order the files are applied in.
 *
 * Drizzle's migrator reads the highest `created_at` already in `__migrations` **once**, before the
 * loop, and then applies every journal entry whose `when` is greater than it. It does not re-read
 * that value as it goes, and it does not compare per file. So an entry whose `when` is lower than
 * one already applied is not "applied late" — it is skipped, permanently, with no error.
 *
 * **Nothing else could catch it.** `migrations.test.ts` applies the folder file by file against a
 * scratch database, which is the right way to test that the SQL is idempotent and the wrong way to
 * notice this: it never consults the journal. And a fresh database is fine either way, because with
 * an empty `__migrations` there is no floor to fall below — so a developer's machine, CI and every
 * new install all agree that everything is well, and only an existing deployment is missing a table.
 * That combination is why this is a test about a JSON file rather than about SQL.
 *
 * `module-hr`'s `0009_beyond_cap_minutes` sat about a day below `0007` and would never have reached
 * a deployed instance. This file is that guard, copied here before there is a second migration to
 * get wrong — which is the point: the folder already has two entries, and the next one is written by
 * somebody who has not read this comment.
 */
const MIGRATIONS = fileURLToPath(new URL('../../migrations', import.meta.url))

const journal = JSON.parse(readFileSync(`${MIGRATIONS}/meta/_journal.json`, 'utf8')) as {
  entries: Array<{ idx: number; when: number; tag: string }>
}

describe('the migration journal', () => {
  it('has entries in the order they are applied', () => {
    expect(journal.entries.length).toBeGreaterThan(0)
    for (let i = 1; i < journal.entries.length; i++)
      expect(
        journal.entries[i]!.idx,
        `${journal.entries[i]!.tag} is listed before ${journal.entries[i - 1]!.tag}; the journal array is the apply order`,
      ).toBeGreaterThan(journal.entries[i - 1]!.idx)
  })

  it('never lets a later migration carry an earlier timestamp', () => {
    let highest = Number.NEGATIVE_INFINITY
    let highestTag = '(none)'
    for (const entry of journal.entries) {
      expect(
        entry.when,
        `${entry.tag} has when=${entry.when}, which is below ${highestTag}'s ${highest}. ` +
          'Drizzle compares each entry against the highest timestamp already applied, so this file ' +
          'would be skipped on every database that has reached that one — silently, and only on ' +
          'databases that already exist. Raise it above the entry before it.',
      ).toBeGreaterThan(highest)
      highest = entry.when
      highestTag = entry.tag
    }
  })

  it('names a file for every entry, and an entry for every file', () => {
    // The other half of the same failure: a `.sql` the journal does not name is never applied at
    // all, on any database, and an entry naming a file that is not there throws at boot — which for
    // a module's migrations is a host service that does not start.
    const files = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .sort()
    expect(journal.entries.map((e) => `${e.tag}.sql`)).toEqual(files)
  })
})
