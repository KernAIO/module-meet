/**
 * Reading why a connection to the media server did not happen.
 *
 * Structural rather than imported: `livekit-client` exports a `ConnectionError` class and a reason
 * enum, and importing either would put a WebRTC SDK into this file — which is loaded by the suite
 * and, more importantly, is the file that decides what to say when the SDK could not load or could
 * not connect. So it reads the shape off the value it was handed.
 */

/** What the screen has something different to say about. */
export type ConnectFailure = 'blocked' | 'refused' | 'unknown'

const numberOf = (value: unknown): number | null => (typeof value === 'number' ? value : null)

const stringOf = (value: unknown): string => (typeof value === 'string' ? value : '')

/**
 * `refused` is the server saying no; everything else a connection attempt can produce is `blocked`.
 *
 * That asymmetry is deliberate. A 401 or 403 from the signalling endpoint means the token was not
 * accepted — a Kern problem, and one a retry will not fix — while a timeout, a socket that never
 * opened and an ICE negotiation that never completed are all the same thing to the person in front
 * of the screen: the network between them and the media server did not carry a call. Naming UDP in
 * that sentence is a guess only in the sense that every diagnosis is; it is the cause in the great
 * majority of cases on a correctly configured instance, and the screen says "appears to be" rather
 * than asserting it.
 */
export function classifyConnectError(error: unknown): ConnectFailure {
  if (!error || typeof error !== 'object') return 'unknown'
  const status = numberOf((error as { status?: unknown }).status)
  if (status === 401 || status === 403) return 'refused'
  const name = stringOf((error as { name?: unknown }).name)
  if (name === 'ConnectionError' || name === 'MediaDeviceError' || name === 'PublishTrackError')
    return 'blocked'
  // A dynamic `import()` that failed is a chunk that did not load, not a network that blocked a
  // call — but from here it is still "we could not connect", and Try again is the right offer.
  return 'unknown'
}

/**
 * The refusal code the server sent, out of wherever this transport put it.
 *
 * oRPC hands a screen `{ code }`; the in-memory mock throws its own error with the same field, and
 * both are read here so the demo can reach the same branch a real instance reaches. `NOT_FOUND` is
 * the one that matters: a meeting in another workspace answers 404 rather than 403, because 403
 * would tell a caller that an id they guessed exists somewhere.
 */
export function errorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const code = (error as { code?: unknown }).code
  if (typeof code === 'string') return code
  const data = (error as { data?: { code?: unknown } }).data
  return data && typeof data.code === 'string' ? data.code : null
}

/**
 * The address a person sends somebody so they land in this meeting.
 *
 * Built rather than read off `location.href` so that a query string — a mock flag, a tab id, a
 * `?from=` somebody was linked with — is never copied into an invitation. The origin comes from the
 * page because that is the hostname whoever is being invited has to be able to reach; an instance
 * behind two names would otherwise hand out the one this module happened to be configured with.
 */
export function meetingLink(origin: string, workspaceSlug: string, meetingId: string): string {
  return `${origin.replace(/\/+$/, '')}/${workspaceSlug}/meet/m/${meetingId}`
}
