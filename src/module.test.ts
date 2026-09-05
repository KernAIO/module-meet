/**
 * This module's guard rails. Keep this file: it is what stops the contract and the module drifting.
 *
 * It needs no database and no running service. Today the module is empty, so most of what it checks
 * is checked over an empty set — which is the point: the loops start working the moment the first
 * permission, capability, event or procedure is added, rather than being written afterwards when
 * the schema is "finished".
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  MODULE_ID,
  meetCapabilities,
  meetCapabilityProcedures,
  meetContract,
  meetEvents,
  meetPermissions,
} from './contract/index.js'
import { meetModule } from './server/index.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  name: string
  version: string
  license: string
}

describe('the module declares what it uses', () => {
  it('names its permissions, capabilities and events under its own module id', () => {
    for (const p of meetPermissions) expect(p.key.startsWith(`${MODULE_ID}.`), p.key).toBe(true)
    for (const e of Object.values(meetEvents) as Array<{ name: string }>)
      expect(e.name.startsWith(`${MODULE_ID}.`), e.name).toBe(true)
  })

  it('registers those permissions, capabilities and events on the server module', () => {
    expect(meetModule.definition.id).toBe(MODULE_ID)
    expect(meetModule.definition.permissions).toBe(meetPermissions)
    expect(meetModule.definition.capabilities).toBe(meetCapabilities)
    expect(meetModule.definition.events).toBe(meetEvents)
  })

  it('reads its version from package.json rather than repeating it as a literal', () => {
    // A literal is never bumped by the release, so every shipped module reported a version months
    // out of date — in the admin UI and in `installed_version`.
    expect(meetModule.definition.version).toBe(pkg.version)
  })

  it('names only capabilities the module actually declares', () => {
    const known = new Set(meetCapabilities.map((c) => c.id))
    for (const id of Object.keys(meetCapabilityProcedures))
      expect(known.has(id), `meetCapabilityProcedures names unknown capability "${id}"`).toBe(true)
  })
})

describe('the module is inert until something is put behind a switch', () => {
  /*
   * `isEnabled` in core answers `row?.enabled ?? true`, so a module added to a host image is on in
   * every workspace on every instance the night it rolls out. Capabilities are the only mitigation
   * available today, and a `required` one is never offered as a switch at all — so this module may
   * not declare one until every surface it opens is behind a capability that defaults to off.
   */
  it('declares no capability that is always on', () => {
    expect(meetCapabilities.filter((c) => c.required).map((c) => c.id)).toEqual([])
  })

  it('declares no capability that is on for a workspace which never touched the switchboard', () => {
    expect(meetCapabilities.filter((c) => c.defaultEnabled).map((c) => c.id)).toEqual([])
  })

  it('mounts no procedures, so nothing answers under /api/meet', () => {
    // The whole point of the first slice: the repository exists and builds, and a host that imports
    // it gains an empty Postgres schema and no surface at all.
    expect(Object.keys(meetContract)).toEqual([])
    expect(meetModule.router).toBeUndefined()
  })

  it('attaches a contract whenever it attaches a router', () => {
    // A router with no contract cannot be checked against anything, and the developer panel says so
    // rather than reporting every implemented procedure as undeclared.
    if (meetModule.router) expect(meetModule.contract).toBeDefined()
  })
})

describe('the package is the one the organisation expects', () => {
  it('is the AGPL half of the licence split', () => {
    // The framework and the module template are Apache-2.0 so anyone can write a closed module; the
    // product — including every first-party module — is AGPL-3.0-only.
    expect(pkg.name).toBe('@kernhq/module-meet')
    expect(pkg.license).toBe('AGPL-3.0-only')
  })

  it('ships a migrations folder the host can point at', () => {
    const journal = JSON.parse(
      readFileSync(join(meetModule.migrationsFolder!, 'meta', '_journal.json'), 'utf8'),
    ) as { entries: Array<{ when: number; tag: string }> }

    /*
     * Drizzle reads the highest `created_at` already applied **once**, before its loop, then applies
     * every entry above it — so an entry whose `when` is lower than one before it is not applied
     * late, it is skipped permanently, silently, and only on databases that already exist. A fresh
     * database has no floor to fall below, so every laptop, all of CI and every new install agree
     * that nothing is wrong.
     */
    let previous = Number.NEGATIVE_INFINITY
    for (const entry of journal.entries) {
      expect(entry.when, `${entry.tag} does not come after the entry before it`).toBeGreaterThan(previous)
      previous = entry.when
    }
  })
})
