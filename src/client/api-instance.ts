import { getHost } from '@kernhq/ui'
import { createMeetClient, type MeetApi } from './api.js'
import { createMockMeetApi } from './mock.js'

/**
 * This module's API client, made once and shared.
 *
 * The origin comes from the shell, never from an env var read here: same-origin in every real
 * deployment, so a module never has to know which service hosts it or on what port.
 *
 * The shell also decides whether it is running against the in-memory implementation, which
 * satisfies the same contract types — so no screen has a second code path for demos and end-to-end
 * tests.
 */
let cached: MeetApi | null = null

export function getMeetApi(): MeetApi {
  if (cached) return cached
  const host = getHost()
  cached = host.isMock
    ? (createMockMeetApi() as unknown as MeetApi)
    : createMeetClient({ baseUrl: host.apiBaseUrl })
  return cached
}

/** Test seam: install a fake without touching module state elsewhere. */
export function __setMeetApi(api: MeetApi | null) {
  cached = api
}
