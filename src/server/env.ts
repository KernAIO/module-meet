import { z } from 'zod'

/**
 * The LiveKit connection this module needs, read once at boot.
 *
 * **Blank is not absent, and the whole schema turns on that.** Every shipped compose file passes its
 * variables through unconditionally, so a key nobody filled in arrives as `''` rather than as
 * missing — and zod tells the two apart. Half a schema written the obvious way then refuses the
 * empty string ("Invalid URL") and throws before the service binds its port; the other half is
 * quietly wrong, because `.default()` only fires for `undefined`. That has taken every self-hosted
 * instance down once already (`KERN_SIGNUP=`) and is recorded in the umbrella's CLAUDE.md.
 *
 * So blank maps to undefined for the whole object at once, before any field is parsed. Per field is
 * a rule the next field has to remember.
 *
 * **Nothing here is required.** An instance with no LiveKit is the normal case — the `calls` profile
 * is not in a default install — and this module must load, answer `meet.config.get` honestly and
 * refuse to mint a token, rather than stop the host service from starting. A missing secret is a
 * feature that is off, never a boot failure: `core` hosts five other modules and takes them all down
 * with it if this throws.
 */
const blankToUndefined = (value: unknown) => {
  if (typeof value !== 'object' || value === null) return value
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) out[k] = v === '' ? undefined : v
  return out
}

export const MeetEnv = z.preprocess(
  blankToUndefined,
  z.object({
    /**
     * The address the *server* reaches LiveKit on. `ws://livekit:7880` is what every shipped stack
     * passes, and it is correct for the browser; `RoomServiceClient` speaks HTTP and rejects a `ws`
     * scheme, so it is normalised in `livekit.ts` rather than by changing a shipped value that an
     * existing instance would never re-read. See the note there before "fixing" this.
     */
    LIVEKIT_URL: z.string().min(1).optional(),
    LIVEKIT_API_KEY: z.string().min(1).optional(),
    LIVEKIT_API_SECRET: z.string().min(1).optional(),
  }),
)
export type MeetEnv = z.infer<typeof MeetEnv>

/**
 * Configured means a secret exists, and nothing else.
 *
 * Deliberately not "can we reach it": reachability is a live call that belongs in
 * `meet.config.get`, and folding the two together would make a momentarily unreachable media server
 * look like an unconfigured one to an administrator trying to work out which of the two it is.
 */
export const isConfigured = (env: MeetEnv) =>
  Boolean(env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET && env.LIVEKIT_URL)

export const readMeetEnv = (source: NodeJS.ProcessEnv = process.env): MeetEnv =>
  MeetEnv.parse({
    LIVEKIT_URL: source.LIVEKIT_URL,
    LIVEKIT_API_KEY: source.LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET: source.LIVEKIT_API_SECRET,
  })
