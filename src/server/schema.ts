import { moduleSchema } from '@kernhq/kernel'

/**
 * This module's tables, in its own Postgres schema (`mod_meet`).
 *
 * Two rules apply to every table added here, neither optional:
 *
 * - every tenant table carries `workspace_id` and an index that starts with it;
 * - every tenant table gets a row-level security policy, hand-written in the migration, because
 *   drizzle-kit does not generate one. RLS is the last line — the API check is the first, and
 *   somebody will eventually write a query that skips it.
 *
 * There are no tables yet. The schema object exists so `migrationsFolder` has something to belong
 * to and so the first migration has somewhere to land.
 */
export const schema = moduleSchema('meet')

/** Every tenant table, so the RLS migration can be checked against one list rather than memory. */
export const TENANT_TABLES = [] as const
