import { z } from 'zod'

/**
 * Workspace-level settings for Meetings.
 *
 * Deliberately one field. Almost everything else an administrator might want to set about calls is
 * either a capability (a switch with one answer for the whole workspace), a permission (an answer
 * per person), or a property of the media server rather than of the workspace.
 *
 * Note what is *not* here: the capability switches. Those live under a reserved `$capabilities` key
 * the platform owns, so switching one off cannot collide with a settings field and cannot be dropped
 * by a settings round-trip.
 *
 * **Passed to `defineModule`, and only because something reads it.** `defineModule({ settings })` is
 * what puts a field on a workspace's module settings screen, and `meet.config.get` answers
 * `maxParticipants` out of this schema — so the number an administrator sets is the number the
 * server reports. A form control that changes nothing teaches an administrator that the settings
 * screen does not mean anything, which is the same failure as a capability nothing checks;
 * `module.test.ts` pins both halves through `toManifest`.
 *
 * Nothing **enforces** the ceiling yet. `config.get` reports it so a client can, and the server-side
 * refusal belongs in the commit that has a room to count people in.
 */
export const MeetSettings = z.object({
  /**
   * How many people may be in one meeting.
   *
   * A number an administrator can raise, because the honest ceiling depends on the box: LiveKit on
   * the two-core minimum this project publishes is not LiveKit on a sixteen-core one. **The default
   * here is a conservative starting point, not a measured capacity** — the number the docs publish
   * is the one the acceptance run on real hardware actually reached, and no number is published
   * before it is measured.
   */
  maxParticipants: z.number().int().min(2).max(200).default(20),
})
export type MeetSettings = z.infer<typeof MeetSettings>
