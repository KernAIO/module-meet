import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineModule, defineServerModule, httpStatusFor, KernError, packageVersion } from '@kernhq/kernel'
import { MODULE_ID, meetCapabilities, meetContract, meetEvents, meetPermissions } from '../contract/index.js'
import { MeetSettings } from '../contract/settings.js'
import { readMeetEnv } from './env.js'
import { meetJobs } from './jobs.js'
import { meetRouter } from './router.js'
import { schema } from './schema.js'
import { applyLivekitEvent, verifyLivekitWebhook } from './services/webhook.js'

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
 *
 * The LiveKit webhook below is outside that rule and is the only thing that will be. It is not a
 * surface anybody reaches: no principal resolves on it, its authentication is the signature over its
 * own bytes, and it writes only about meetings that already exist — which is to say about workspaces
 * that had `calls` on when the meeting started. Gating it on the capability would strand attendance
 * rows the moment an administrator switched meetings off during a call, which is precisely the state
 * this pair of writers exists to prevent.
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

  /**
   * The one thing oRPC cannot carry: LiveKit picks the URL, the method and the content type, and its
   * signature covers the exact bytes it sent. `raw: true` is what hands the handler those bytes.
   *
   * `/webhooks/livekit` under this module's prefix, so `https://<instance>/api/meet/webhooks/livekit`
   * — which is the address `selfhost/livekit.yaml`'s `webhook:` block names. It is a static path, and
   * Fastify prefers a static path over the `/api/meet/*` wildcard the oRPC handler sits on, so the
   * two do not collide.
   *
   * No principal, no permission and no workspace: the media server is not a Kern caller. The
   * signature is the authentication and it is checked before anything touches the database.
   */
  httpRoutes: [
    {
      method: 'POST',
      path: '/webhooks/livekit',
      raw: true,
      // A LiveKit event is a room and at most one participant. Well under the server's 25 MB, and
      // it means a body that could not be one of these is refused before it is buffered.
      bodyLimit: 256 * 1024,
      handler: async ({ kernel, request, reply, body }) => {
        // Read per request rather than captured when the module was defined: a module is imported
        // before its host service has finished loading the environment, and a handler that captured
        // the empty value would answer 401 for the life of the process on a configured instance.
        const env = readMeetEnv()
        const header = request.headers.authorization
        try {
          const event = await verifyLivekitWebhook(env, body as Buffer, header)
          const applied = await applyLivekitEvent(kernel, event)
          return { received: true, applied }
        } catch (err) {
          /*
           * A 4xx tells LiveKit to stop retrying, so only the two failures a retry cannot fix get
           * one: a body this instance cannot authenticate, and a body that will never parse.
           */
          if (err instanceof KernError && (err.code === 'UNAUTHORIZED' || err.code === 'BAD_REQUEST')) {
            kernel.log.warn({ err: err.message }, 'meet: refused a LiveKit webhook')
            return reply.status(httpStatusFor(err.code)).send({ code: err.code, message: err.message })
          }
          /*
           * 500, set explicitly, never by rethrowing. Fastify answers a thrown error with that
           * error's own `statusCode`, so an error carrying somebody else's HTTP status would reach
           * LiveKit as a 4xx — read as "delivered, do not send this again" — and the event would be
           * lost permanently, which is exactly what this route must not do.
           */
          kernel.log.error({ err: String(err) }, 'meet: a LiveKit webhook failed; LiveKit will retry')
          return reply.status(500).send({ error: 'The webhook could not be applied' })
        }
      },
    },
  ],

  /**
   * The other half of occupancy: what to do when the message above never arrives.
   *
   * A webhook is a message, and a message can be lost — core restarting, the database briefly away,
   * a browser killed on a network that never sent the disconnect. `meet.reconcile` asks LiveKit what
   * is actually true every minute and repairs the difference, so a crashed tab cannot leave a row
   * claiming somebody is in a meeting they left.
   */
  jobs: meetJobs(),
})
export default meetModule
