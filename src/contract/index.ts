/**
 * What this module promises, as data.
 *
 * Imported by **both** halves — the server implements it, the client calls it — so nothing here may
 * touch Node. The contract is the only thing that crosses that line, which is why a procedure that
 * exists here and not in the router is a lie that compiles.
 *
 * **Everything below is deliberately empty.** This package is the repository skeleton for the
 * meetings module: it builds, it publishes, and it does nothing. A permission key, a capability or a
 * procedure declared before something enforces it is a switch that changes nothing, and a
 * switchboard full of those teaches an administrator that none of them mean anything — so each is
 * declared in the change that puts something behind it, and not before.
 */
import { defineCapabilities, definePermissions } from '@kernhq/contracts'

/** Lowercase, 2-32 characters. Names the API prefix, the Postgres schema `mod_<id>` and every event. */
export const MODULE_ID = 'meet'

/** The oRPC contract. No procedures yet, so nothing is mounted at `/api/meet`. */
export const meetContract = {}
export type MeetContract = typeof meetContract

/**
 * Which procedures belong to which capability, as data.
 *
 * Declared rather than inferred, because a missing `requiresCapability` is invisible: the procedure
 * type-checks, the tests pass, and the only symptom is that a workspace which switched the feature
 * off can still call it.
 */
export const meetCapabilityProcedures: Record<string, readonly string[]> = {}

/** `<module>.<entity>.<action>`. Anything that emits one declares it here. */
export const meetEvents = {}

/**
 * Sub-features a workspace can switch off inside this module.
 *
 * When they arrive they arrive **off**: `CapabilityDef.defaultEnabled` is false unless a definition
 * says otherwise, and nothing here may be `required`. That is the only thing standing between a new
 * module in a host service and a workspace being handed a feature it never asked for — `isEnabled`
 * in core answers `row?.enabled ?? true`, so a module added to an image is on everywhere the night
 * it rolls out.
 */
export const meetCapabilities = defineCapabilities([])

/**
 * `<module>.<resource>.<action>`, each with the narrowest scope that works and the roles that hold
 * it by default.
 */
export const meetPermissions = definePermissions([])
