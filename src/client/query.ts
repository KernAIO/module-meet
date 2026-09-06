/**
 * Query keys for Meetings.
 *
 * `[module, entity, …scope]`, so a realtime `change` event invalidates precisely what it touched.
 * The entity segment is **singular** — `realtime.svelte.ts` invalidates `[module, entity]` with
 * whatever the server put in the change event, and `partialMatchKey` compares segment by segment,
 * so a plural here never matches the prefix that arrives and the screen stays stale until a reload.
 *
 * One key so far. `config` is the instance's answer to "can this workspace hold a meeting at all",
 * which is per workspace because the participant limit is a workspace setting; nothing else the
 * meeting screen reads is a query, because a live meeting is a socket rather than a fetch.
 */
export const meetKeys = {
  /** Everything under this module, for the blunt invalidation after a write. */
  all: ['meet'] as const,
  config: (ws: string) => ['meet', 'config', ws] as const,
}
