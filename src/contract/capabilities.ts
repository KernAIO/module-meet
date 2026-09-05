import { defineCapabilities } from '@kernhq/contracts'

/**
 * How much of Meetings this workspace has — and, before that, whether it has any of it.
 *
 * **These two switches are the only thing that keeps this module inert, and that is not a
 * preference.** `isEnabled` in core answers `row?.enabled ?? true`
 * (`repos/core/src/modules/core/services/modules.ts`, read 2026-09-06), so a module added to core's
 * image is switched **on** in every workspace on every instance the night it rolls out — including
 * workspaces created years before the module existed, whose administrators never saw a decision to
 * make. There is no `ModuleManifest.defaultEnabled` to lean on; a capability that defaults to off is
 * what is available today.
 *
 * So neither of these is `required` and neither is `defaultEnabled`. A workspace that has never
 * touched the switchboard resolves both off, `hasCapability` answers false for every contribution
 * that names one, and every procedure behind one answers **404** — the honest answer, because the
 * surface is not there. `forbidden` would say it exists and you may not have it, which is untrue of
 * a workspace that never asked for meetings, and it would contradict a shell that has already
 * hidden the navigation.
 *
 * Both rules that decide whether something belongs here rather than somewhere else hold:
 *
 * - **Not a permission.** "May Ada remove somebody from a call" is about a person, true for her and
 *   false for the next; "does this company do video calls at all" is one answer for everyone, the
 *   owner included.
 * - **Reversible without a migration.** Switching either off writes a boolean into module settings.
 *   The rows stay exactly where they are, and switching it back on finds the history intact.
 *
 * Nothing checks either of them as of this commit — the router is empty and the module is registered
 * in no host service. They are declared first on purpose: a capability added *after* the surfaces it
 * is meant to gate is a capability that at least one surface will be missing.
 */
export const meetCapabilities = defineCapabilities([
  {
    /**
     * Ringing a person, huddling in a conversation, being in a call. The module's foundation — and
     * deliberately not `required`, because `required` means "never offered as a switch", which is
     * exactly the state this module must not be in.
     */
    id: 'calls',
    label: 'Calls',
    description:
      'Audio and video calls: ring a colleague, huddle from a conversation, share a screen, and see who was in a past call',
    defaultEnabled: false,
    level: 1,
  },
  {
    /**
     * Named places that are there whether or not anybody is in them — a standup room somebody walks
     * into at ten past nine.
     *
     * `dependsOn: ['calls']` says the obvious out loud: a room is somewhere to hold a call, so there
     * is nothing to enter with calls off. `resolveCapabilities` computes that closure, so no screen
     * has to remember to check two switches. It also means rooms can be cut as one flag and one
     * unshipped screen rather than as a schema change — which is most of why it is a capability.
     */
    id: 'rooms',
    label: 'Meeting rooms',
    description: 'Named rooms that are always there, with the faces of whoever is in each one now',
    dependsOn: ['calls'],
    defaultEnabled: false,
    level: 2,
  },
])

export type MeetCapabilityId = (typeof meetCapabilities)[number]['id']

/**
 * Which procedures sit behind which capability, as data.
 *
 * Declared rather than inferred, because a missing `requiresCapability` is invisible: the procedure
 * type-checks, every other test passes, and the only symptom is that a workspace which switched the
 * feature off can still call it. The client reads this map to decide what to hide and the router
 * decides what to answer — a procedure gated in one and not the other is a tab that is there and
 * 404s, or one that is hidden and works.
 *
 * Empty because the contract is empty. `module.test.ts` reads it, and its loops are written to start
 * working the moment the first procedure arrives rather than being added afterwards, when the
 * router is "finished".
 */
export const meetCapabilityProcedures: Record<MeetCapabilityId, readonly string[]> = {
  calls: [],
  rooms: [],
}
