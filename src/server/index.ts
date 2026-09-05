import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineModule, defineServerModule, packageVersion } from '@kernhq/kernel'
import { MODULE_ID, meetCapabilities, meetEvents, meetPermissions } from '../contract/index.js'
import { schema } from './schema.js'

/**
 * The meetings module, as a host service sees it.
 *
 * It is registered nowhere — not in `core`'s `featureModules`, not in the app shell — and it mounts
 * no router, so importing it costs a host the four tables in `mod_meet` and no API surface at all.
 *
 * That is the safest state to leave this in, and the reason is worth having in front of whoever
 * wires it up next. `isEnabled` in core answers `row?.enabled ?? true`, so a module added to an
 * image is switched **on** in every workspace on every instance the night it rolls out — including
 * workspaces created long before the module existed. The two capabilities this module declares both
 * default to off and neither is `required`, which is what keeps the feature inert until an
 * administrator asks for it; every surface added from here on names one of them, or it is a nav item
 * that appears unannounced and fails on click.
 */
export const meetModule = defineServerModule({
  definition: defineModule({
    id: MODULE_ID,
    name: 'Meetings',
    version: packageVersion(import.meta.url),
    description: 'Audio and video calls for Kern — the schema and the contract; no procedures yet',
    icon: 'video',
    permissions: meetPermissions,
    capabilities: meetCapabilities,
    events: meetEvents,
  }),
  schema,
  migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '../../migrations'),
})
export default meetModule
