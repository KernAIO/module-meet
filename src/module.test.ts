/**
 * This module's guard rails. Keep this file: it is what stops the contract and the router drifting.
 *
 * It needs no database and no running service. It walks the contract and the router as data and
 * checks the three things that are easy to forget and impossible for `tsc` to see:
 *
 *   1. every procedure the contract promises is actually implemented — a contract entry with no
 *      router entry type-checks perfectly and 404s at runtime;
 *   2. every implemented procedure is behind `workspaceScoped(MODULE_ID)` **and** a `requires()` —
 *      a procedure that forgets the second is readable by any member of any workspace;
 *   3. every procedure belonging to a capability carries `requiresCapability`, *between* the two —
 *      so a workspace with the capability off gets the honest 404 rather than the 403 a permission
 *      check would produce first.
 *
 * The two functions those loops call are also aimed at chains built here by hand — one correct and
 * several not — and at a procedure assembled from the **real** kernel middlewares, so the machinery
 * that tells one middleware from another is exercised by this file itself rather than only by
 * whatever the router happens to contain today. It was written that way while the contract was
 * still empty and every loop passed over nothing; it is kept because a checker nobody has watched
 * fail is a checker nobody knows the shape of.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { baseContract } from '@kernhq/contracts'
import { type Kernel, requires, requiresCapability, toManifest, workspaceScoped } from '@kernhq/kernel'
import { implement } from '@orpc/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  MODULE_ID,
  meetCapabilities,
  meetCapabilityProcedures,
  meetContract,
  meetEvents,
  meetNotificationTypes,
  meetPermissions,
  ws,
} from './contract/index.js'
import { meetModule } from './server/index.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  name: string
  version: string
  license: string
}

/** An oRPC procedure (contract or implementation) carries `~orpc`; a router group does not. */
interface Leaf {
  '~orpc': {
    route?: { method?: string; path?: string }
    middlewares?: unknown[]
  }
}
const isLeaf = (node: unknown): node is Leaf => typeof node === 'object' && node !== null && '~orpc' in node

/** `{ meetings: { start, join } }` → `{ 'meetings.start': leaf, 'meetings.join': leaf }` */
function leaves(node: unknown, path: string[] = []): Record<string, Leaf> {
  if (isLeaf(node)) return { [path.join('.')]: node }
  if (typeof node !== 'object' || node === null) return {}
  return Object.entries(node).reduce<Record<string, Leaf>>(
    (acc, [key, value]) => Object.assign(acc, leaves(value, [...path, key])),
    {},
  )
}

// The router is only inspected, never called, so it needs no real kernel behind it.
const declared = leaves(meetContract)
const implemented = leaves(meetModule.router ? meetModule.router({} as Kernel) : {})

describe('the contract and the router agree', () => {
  it('implements every declared procedure, and nothing that was never declared', () => {
    expect(Object.keys(implemented).sort()).toEqual(Object.keys(declared).sort())
  })

  it('keeps the REST route the contract published', () => {
    for (const [name, leaf] of Object.entries(implemented)) {
      const contractRoute = declared[name]?.['~orpc'].route
      expect(leaf['~orpc'].route?.method, `${name} method`).toBe(contractRoute?.method)
      expect(leaf['~orpc'].route?.path, `${name} path`).toBe(contractRoute?.path)
    }
  })

  it('attaches a contract whenever it attaches a router', () => {
    // A router with no contract cannot be checked against anything, and the developer panel then
    // reports every implemented procedure as undeclared.
    if (meetModule.router) expect(meetModule.contract).toBeDefined()
  })

  it('publishes exactly the three procedures this slice is meant to have', () => {
    // Pinned, so a fourth is a decision somebody records here rather than a line nobody notices —
    // and so the loops above can never pass over an empty set again without this failing first.
    expect(Object.keys(declared).sort()).toEqual(['config.get', 'meetings.join', 'meetings.start'])
  })

  it('answers config on GET and both meeting procedures on POST', () => {
    // The REST shape an administrator's `curl` and the generated OpenAPI both depend on. Without a
    // `.route()` oRPC invents one from the procedure's path, which is a working API and not the one
    // the docs describe.
    const routes = Object.fromEntries(
      Object.entries(declared).map(([name, leaf]) => [
        name,
        `${leaf['~orpc'].route?.method} ${leaf['~orpc'].route?.path}`,
      ]),
    )
    expect(routes).toEqual({
      'config.get': 'GET /config',
      'meetings.start': 'POST /meetings',
      'meetings.join': 'POST /meetings/{meetingId}/join',
    })
  })
})

/**
 * Which middleware is which — established by what each one *does*, because there is nothing else to
 * go on.
 *
 * `workspaceScoped`, `requiresCapability` and `requires` all come back from oRPC as a function
 * carrying identical own properties: no name, no tag, nothing to compare. So each middleware is
 * called against a kernel stub that records what it reached for, and what it reached for is its
 * identity.
 *
 * This is what a `middlewares.length >= 2` check cannot do: any two middlewares satisfy a count, so
 * a procedure that had lost `workspaceScoped` and kept two permission checks passes it. A count is
 * not an assertion about authorisation; it is an assertion about arithmetic.
 */
interface Reached {
  /** the module id `workspaceScoped` asked `isModuleEnabled` about */
  module?: string
  /** the permission `requires` asked `authz.require` for */
  permission?: string
  /** the `<module>.<capability>` `requiresCapability` looked up */
  capability?: string
}

type MiddlewareFn = (
  options: { context: unknown; procedure?: unknown; next: (options?: unknown) => Promise<unknown> },
  input: unknown,
) => Promise<unknown>

const WORKSPACE = '00000000-0000-4000-8000-000000000000'

async function reachedFor(middleware: unknown, procedure?: unknown): Promise<Reached> {
  const seen: Reached = {}
  const kernel = {
    authz: {
      requireMember: () => undefined,
      require: async (_principal: unknown, permission: string) => {
        seen.permission = permission
      },
    },
    isModuleEnabled: async (_workspaceId: string, moduleId: string) => {
      seen.module = moduleId
      return true
    },
    // The real one answers a Set; a stub only has to record which capability was asked about.
    capabilities: async (_workspaceId: string, moduleId: string) => ({
      has: (capability: string) => {
        seen.capability = `${moduleId}.${capability}`
        return true
      },
    }),
    // Two gates inside `workspaceScoped` sit after the membership check, and both must fall open
    // here: nothing bills in a test, so the API budget never refuses and entitlements answer
    // `source: 'none'` — the shape every self-hosted instance runs with.
    apiBudget: { check: async () => ({ ok: true, limit: 60, retryAfterSec: 60 }) },
    entitlements: {
      of: async () => ({ source: 'none', active: true }),
      requireActive: async () => undefined,
    },
  }
  const principal = { kind: 'user', userId: WORKSPACE, instanceAdmin: false, memberships: [] }
  // `workspaceScoped` reads the procedure's `~orpc` (route method + middlewares) to decide whether
  // the suspension gate applies. Builder views do not always carry a route; give any such view the
  // shape of a plain non-reading procedure, which falls open through entitlements `source: 'none'`.
  const proc = procedure as { '~orpc'?: { route?: unknown; middlewares?: unknown } } | undefined
  const normalized = proc?.['~orpc']
    ? proc['~orpc'].route
      ? procedure
      : { '~orpc': { ...proc['~orpc'], route: {} } }
    : { '~orpc': { route: {}, middlewares: [] } }
  await (middleware as MiddlewareFn)(
    { context: { kernel, principal }, procedure: normalized, next: async () => ({}) },
    { workspaceId: WORKSPACE },
  )
  return seen
}

const chainOf = (name: string): unknown[] => implemented[name]?.['~orpc'].middlewares ?? []

/** What every implemented procedure's middleware chain reached for, resolved once. */
async function resolveChains(): Promise<Record<string, Reached[]>> {
  const entries = await Promise.all(
    Object.keys(implemented).map(
      async (name) =>
        [name, await Promise.all(chainOf(name).map((m) => reachedFor(m, implemented[name])))] as const,
    ),
  )
  return Object.fromEntries(entries)
}

/**
 * Which of `names` is not properly authorised — a pure function of the resolved chains, so the check
 * can be aimed at chains built by hand as well as at the real router.
 *
 * Two failures, both of which have shipped in this organisation before: no `workspaceScoped` first
 * (so a stranger reaches the procedure, or reaches it in a workspace that has the module off), and
 * no `requires()` at all (so every member of every workspace with the module on may call it).
 */
function unauthorised(
  names: readonly string[],
  chains: Record<string, Reached[]>,
  permissionKeys: ReadonlySet<string>,
): string[] {
  return names.filter((name) => {
    const chain = chains[name] ?? []
    if (chain[0]?.module !== MODULE_ID) return true
    return !chain.slice(1).some((r) => r.permission !== undefined && permissionKeys.has(r.permission))
  })
}

/**
 * Which of `names` the router does **not** put behind `capability`, in the right place.
 *
 * Two ways to fail, and both matter: no capability gate at all, and a gate that sits *after* the
 * permission check. The order is the whole point of `workspaceScoped` → `requiresCapability` →
 * `requires`: a workspace with the module off must be refused before anything reveals which
 * capabilities it would have had, and a workspace with the capability off must get 404 rather than
 * the 403 a permission check would produce first.
 */
function ungated(capability: string, names: readonly string[], chains: Record<string, Reached[]>): string[] {
  return names.filter((name) => {
    const chain = chains[name] ?? []
    const gate = chain.findIndex((r) => r.capability === `${MODULE_ID}.${capability}`)
    const permission = chain.findIndex((r) => r.permission !== undefined)
    // Index 0 is `workspaceScoped`'s place, so a gate there is a gate that displaced it.
    if (gate < 1) return true
    return permission !== -1 && gate > permission
  })
}

describe('every procedure is authorised', () => {
  const permissionKeys = new Set<string>(meetPermissions.map((p) => p.key))

  it('puts the workspace gate first and a declared permission after it, on every procedure', async () => {
    const chains = await resolveChains()
    expect(
      unauthorised(Object.keys(implemented), chains, permissionKeys),
      `each of these needs workspaceScoped('${MODULE_ID}') first and requires(<a permission this module declares>) after it`,
    ).toEqual([])
  })

  /**
   * The procedures that are deliberately behind **no** capability, and the reason for each.
   *
   * This is the half of the rule that cannot be derived, so it is written out and kept short. It is
   * an *opt-out* list rather than an opt-in one, which is the direction that fails safe: a
   * procedure added to the contract and forgotten everywhere else appears in neither this list nor
   * `meetCapabilityProcedures`, and the accounting test below names it. Checking only the
   * procedures the map already claims would make the map both the claim and the evidence for it.
   */
  const UNGATED_ON_PURPOSE = ['config.get']

  it('accounts for every declared procedure — gated, or ungated on purpose', () => {
    const mapped = Object.values(meetCapabilityProcedures).flat()
    expect(
      [...new Set(mapped)].length,
      'a procedure named under two capabilities is gated by whichever middleware the router happens to carry',
    ).toBe(mapped.length)
    expect(
      [...mapped, ...UNGATED_ON_PURPOSE].sort(),
      'every procedure is behind a capability or is on the list of ones deliberately not',
    ).toEqual(Object.keys(declared).sort())
  })

  it('gates every procedure its capability claims, between the workspace gate and the permission', async () => {
    const chains = await resolveChains()
    for (const capability of meetCapabilities.filter((c) => !c.required).map((c) => c.id)) {
      const group = [...(meetCapabilityProcedures[capability] ?? [])].sort()
      expect(
        ungated(capability, group, chains),
        `these need requiresCapability('${MODULE_ID}', '${capability}') between the workspace gate and the permission check`,
      ).toEqual([])
    }
  })

  it('puts no capability gate on the one procedure that must answer with the feature off', async () => {
    /*
     * `config.get` is the diagnostic. An administrator whose meetings do not work asks it precisely
     * when `calls` is off, so a gate on it would answer 404 to the only question worth asking. It is
     * still behind `workspaceScoped` and a permission — it is the *capability* it must not carry.
     */
    const chains = await resolveChains()
    for (const name of UNGATED_ON_PURPOSE)
      expect(
        (chains[name] ?? []).filter((r) => r.capability !== undefined),
        `${name} must reach no capability`,
      ).toEqual([])
  })
})

/**
 * The checkers, aimed at chains this file builds — because a check nobody has watched fail is a
 * check nobody knows the shape of.
 *
 * With an empty contract every loop above passes over an empty set, so without this the whole file
 * would be an assertion about nothing wearing a green tick.
 */
describe('the checks reject what they claim to reject', () => {
  const permissionKeys = new Set(['meet.call.join', 'meet.call.start'])

  it('names an unauthorised procedure, and only that one', () => {
    const chains: Record<string, Reached[]> = {
      'meetings.join': [{ module: MODULE_ID }, { permission: 'meet.call.join' }],
      // No workspace gate at all: reachable by a stranger, and in a workspace with meet switched off.
      'meetings.start': [{ permission: 'meet.call.start' }],
      // Gated on the workspace and on nothing else: every member of every workspace may call it.
      'meetings.list': [{ module: MODULE_ID }],
      // A permission, but one this module does not declare — a typo that authorises nothing.
      'meetings.end': [{ module: MODULE_ID }, { permission: 'meet.call.hostt' }],
      // The workspace gate is present but not first, so the permission check runs before membership.
      'meetings.get': [{ permission: 'meet.call.join' }, { module: MODULE_ID }],
    }
    expect(unauthorised(Object.keys(chains), chains, permissionKeys)).toEqual([
      'meetings.start',
      'meetings.list',
      'meetings.end',
      'meetings.get',
    ])
  })

  it('names an ungated procedure, and one gated in the wrong place', () => {
    const chains: Record<string, Reached[]> = {
      'rooms.list': [
        { module: MODULE_ID },
        { capability: `${MODULE_ID}.rooms` },
        { permission: 'meet.call.join' },
      ],
      // The regression this exists for: somebody added a procedure and no capability middleware.
      'rooms.create': [{ module: MODULE_ID }, { permission: 'meet.call.start' }],
      // Gated, but after the permission — so a workspace with rooms off gets 403 before the 404
      // that is the honest answer.
      'rooms.update': [
        { module: MODULE_ID },
        { permission: 'meet.call.start' },
        { capability: `${MODULE_ID}.rooms` },
      ],
      // Gated on a different capability, which only the identity check catches.
      'rooms.delete': [
        { module: MODULE_ID },
        { capability: `${MODULE_ID}.calls` },
        { permission: 'meet.call.start' },
      ],
    }
    expect(ungated('rooms', Object.keys(chains), chains)).toEqual([
      'rooms.create',
      'rooms.update',
      'rooms.delete',
    ])
  })

  /**
   * And the identity machinery itself, against the **real** middlewares rather than a hand-written
   * `Reached`.
   *
   * `reachedFor` is the part most likely to rot silently: it drives the kernel's middlewares against
   * a stub, so a kernel release that adds a call inside `workspaceScoped` breaks it — and with an
   * empty router nothing else here would run it at all. This builds one procedure the way the router
   * will, and asserts the chain resolves to the three things in the order the rules require.
   */
  it('tells the three real kernel middlewares apart, in order', async () => {
    const fixture = {
      probe: baseContract
        .route({ method: 'GET', path: '/probe', tags: ['meet'] })
        .input(ws)
        .output(z.object({ ok: z.boolean() })),
    }
    const os = implement(fixture).$context<never>()
    const probe = os.probe
      .use(workspaceScoped(MODULE_ID) as never)
      .use(requiresCapability(MODULE_ID, 'calls') as never)
      .use(requires('meet.call.join') as never)
      .handler(async () => ({ ok: true }))

    const chain = await Promise.all(
      ((probe as unknown as Leaf)['~orpc'].middlewares ?? []).map((m) => reachedFor(m, probe)),
    )
    expect(chain).toEqual([
      { module: MODULE_ID },
      { capability: `${MODULE_ID}.calls` },
      { permission: 'meet.call.join' },
    ])
    expect(unauthorised(['probe'], { probe: chain }, new Set(['meet.call.join']))).toEqual([])
    expect(ungated('calls', ['probe'], { probe: chain })).toEqual([])
  })
})

describe('the module declares what it uses', () => {
  it('names its permissions, capabilities and events under its own module id', () => {
    for (const p of meetPermissions) expect(p.key.startsWith(`${MODULE_ID}.`), p.key).toBe(true)
    for (const e of Object.values(meetEvents) as Array<{ name: string }>)
      expect(e.name.startsWith(`${MODULE_ID}.`), e.name).toBe(true)
    for (const n of meetNotificationTypes) expect(n.type.startsWith(`${MODULE_ID}.`), n.type).toBe(true)
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
    const known = new Set<string>(meetCapabilities.map((c) => c.id))
    for (const id of Object.keys(meetCapabilityProcedures))
      expect({ id, declared: known.has(id) }).toEqual({ id, declared: true })
  })

  it('names only procedures the contract actually has', () => {
    for (const name of Object.values(meetCapabilityProcedures).flat())
      expect({ name, exists: name in declared }).toEqual({ name, exists: true })
  })

  it('resolves every dependsOn to a capability beside it', () => {
    const known = new Set<string>(meetCapabilities.map((c) => c.id))
    for (const c of meetCapabilities)
      for (const dep of c.dependsOn ?? [])
        expect({ capability: c.id, dep, known: known.has(dep) }).toEqual({
          capability: c.id,
          dep,
          known: true,
        })
  })
})

describe('the module is inert until an administrator asks for it', () => {
  /*
   * `isEnabled` in core answers `row?.enabled ?? true`, so a module added to a host image is on in
   * every workspace on every instance the night it rolls out — including workspaces created long
   * before the module existed. There is no `ModuleManifest.defaultEnabled` to lean on, so these two
   * capabilities are the only thing standing between that and a Meetings nav item that appears
   * unannounced and fails on click.
   */
  it('declares no capability that is always on', () => {
    // `required: true` means "never offered as a switch", which is the one state this module must
    // not be in — an administrator has to be able to say no.
    expect(meetCapabilities.filter((c) => c.required).map((c) => c.id)).toEqual([])
  })

  it('declares no capability that is on for a workspace which never touched the switchboard', () => {
    expect(meetCapabilities.filter((c) => c.defaultEnabled).map((c) => c.id)).toEqual([])
  })

  it('puts a field on the module settings screen only because something reads it', () => {
    /*
     * `MeetSettings` is registered now, and `meet.config.get` is what earns it: the number an
     * administrator sets is the number the server answers. A control nothing reads is the same lie
     * as a capability nothing checks, so the two arrive together or not at all.
     *
     * Asserted through `toManifest`, because that is where the field a screen renders is actually
     * produced: `ModuleDefinition` carries `settings` and only the **manifest** carries
     * `settingsSchema`. Reading `definition.settingsSchema` — which does not exist — passed happily
     * either way, which is the vacuous shape this whole file is written to avoid.
     */
    expect(meetModule.definition.settings, 'config.get reads maxParticipants out of it').toBeDefined()
    expect(toManifest(meetModule.definition).settingsSchema, 'so core renders the form').toBeDefined()
  })

  it('declares the two capabilities every later surface has to name', () => {
    // Pinned so that adding a screen behind a *third* capability, or renaming one of these, is a
    // decision somebody makes rather than a line nobody notices.
    expect(meetCapabilities.map((c) => c.id)).toEqual(['calls', 'rooms'])
    expect(meetCapabilities.find((c) => c.id === 'rooms')?.dependsOn).toEqual(['calls'])
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
    expect(journal.entries.length, 'the schema this module owns').toBeGreaterThan(0)
  })
})
