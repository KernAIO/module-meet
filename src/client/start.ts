import { getMeetApi } from './api-instance.js'

/**
 * Open a meeting that did not exist a moment ago.
 *
 * Its own file so the command palette can reach it with a dynamic `import()`. Anything `module.ts`
 * imports statically is imported by the shell's registry at build time, which puts it into the
 * first paint of every page in the product — and this one pulls in the API client and the whole
 * in-memory mock behind it. A command is pressed once in a blue moon; it can afford a round trip.
 *
 * `meetings.start` is what creates the row and the LiveKit room name. The token it returns is
 * deliberately dropped: the screen calls `meetings.join`, which is the only place in Kern that
 * mints one, and a second minting site here would be a second place for a grant to be wrong.
 */
export async function startMeeting(workspaceId: string): Promise<string | null> {
  try {
    const admitted = await getMeetApi().meetings.start({ workspaceId })
    return admitted.meeting.id
  } catch {
    return null
  }
}
