import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineModule, defineServerModule, packageVersion } from '@kernhq/kernel'
import { MODULE_ID, meetCapabilities, meetContract, meetEvents, meetPermissions } from '../contract/index.js'
import { MeetSettings } from '../contract/settings.js'
import { meetRouter } from './router.js'
import { schema } from './schema.js'

/**
 * The meetings module, as a host service sees it.
 *
 * It now mounts a router at `/api/meet` with three procedures, and the thing to understand before
 * adding a fourth is why that is still safe for every workspace that has never asked for meetings.
 *
 * `isEnabled` in core answers `row?.enabled ?? true`, so a module added to an image is switched
 * **on** in every workspace on every instance the night it rolls out — including workspaces created
 * long before the module existed. What keeps this inert is that both capabilities default to off
 * and neither is `required`: `meetings.start` and `meetings.join` sit behind
 * `requiresCapability('meet','calls')` and therefore answer **404** in a workspace that has not
 * switched it on, exactly as anything else that is not there does.
 *
 * `config.get` is the deliberate exception and the only one there will be. It answers whether the
 * instance can hold a meeting at all, which is the question an administrator asks precisely when the
 * capability is off — so gating it on `calls` would make it useless. It is behind workspace
 * membership, reads no meeting and reveals nothing but whether a media server is configured and
 * reachable.
 *
 * Every surface added from here on names a capability, or it is a nav item that appears unannounced
 * in every existing workspace and fails on click.
 */
export const meetModule = defineServerModule({
  definition: defineModule({
    id: MODULE_ID,
    name: 'Meetings',
    version: packageVersion(import.meta.url),
    description: 'Audio and video calls for Kern — configuration, and the join token',
    icon: 'video',
    permissions: meetPermissions,
    capabilities: meetCapabilities,
    events: meetEvents,
    // Registered now, in the commit that first reads it: `meet.config.get` answers
    // `maxParticipants` out of these settings, so the field an administrator sees on the module
    // settings screen is one the server actually consults.
    settings: MeetSettings,
  }),
  contract: meetContract,
  schema,
  migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '../../migrations'),
  router: meetRouter,
})
export default meetModule
