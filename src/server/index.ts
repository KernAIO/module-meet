import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineModule, defineServerModule, packageVersion } from '@kernhq/kernel'
import { MODULE_ID, meetCapabilities, meetEvents, meetPermissions } from '../contract/index.js'
import { schema } from './schema.js'

/**
 * The meetings module, as a host service sees it.
 *
 * It is registered nowhere yet — not in `core`'s `featureModules`, not in the app shell — and it
 * declares no contract, no router, no permissions and no capabilities. Importing it costs a host an
 * empty `mod_meet` schema and nothing else.
 *
 * That is on purpose, and it is the safest state to leave this in: `isEnabled` in core answers
 * `row?.enabled ?? true`, so a module added to an image is switched **on** in every workspace on
 * every instance the night it rolls out. Until this module has capabilities that default to off and
 * a screen behind each one, a workspace that has never heard of meetings must not be able to reach
 * anything here.
 */
export const meetModule = defineServerModule({
  definition: defineModule({
    id: MODULE_ID,
    name: 'Meetings',
    version: packageVersion(import.meta.url),
    description: 'Meetings for Kern — not built yet',
    icon: 'video',
    permissions: meetPermissions,
    capabilities: meetCapabilities,
    events: meetEvents,
  }),
  schema,
  migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '../../migrations'),
})
export default meetModule
