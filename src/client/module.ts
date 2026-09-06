import { defineClientModule } from '@kernhq/ui'
import { meetMessageBundles, t } from './i18n.js'
import { MEET_PERMISSIONS } from './permissions.js'

/**
 * This module as the shell sees it.
 *
 * Everything the interface offers is declared here — navigation, routes, commands, widgets,
 * settings pages, sidebars, presenters — and the shell renders whatever it finds. There are no
 * route files in the app to keep in step: deleting this package removes the feature completely,
 * which is the test of whether something is a module at all.
 *
 * Labels are **getters** because a module is defined once at import time while the interface
 * language can change afterwards. Reading them on render keeps every label in the language chosen.
 *
 * **There is still no navigation row, and that is deliberate.** A rail item needs somewhere to land,
 * and the meetings home — the rooms, the recent calls — is a later slice behind the `rooms`
 * capability. A row that opens a screen that does not exist is worse than no row, so the two
 * entries below are the two that can be honoured today: the meeting route itself, which a link
 * reaches, and a command that starts one.
 *
 * Both carry `capability: 'calls'`, which is what keeps this module inert in a workspace that never
 * asked for it. `isEnabled` in core answers `row?.enabled ?? true`, so a module in core's image is
 * *on* everywhere the night it rolls out; `hasCapability(undefined, mod, 'calls')` answers false,
 * and a route the shell does not mount is a 404 rather than a screen that fails on arrival.
 *
 * - `permission` — may *this person* reach it. Somebody else in the workspace may well see it.
 * - `capability` — does *this workspace* have the feature. Nobody sees it when off, and the API
 *   behind it answers 404 rather than 403.
 */
export const meetClientModule = defineClientModule({
  id: 'meet',
  get name() {
    return t('nav')
  },
  icon: 'video',
  messages: meetMessageBundles,

  /**
   * `:meetingId` matches one segment and reaches the component as `params.meetingId`.
   *
   * `meet.call.join` rather than `meet.call.start`: this route is where somebody *arrives*, from a
   * link or from a ring, and the person answering a call is very often not the person allowed to
   * make one. Starting is gated on the command below and on the server.
   */
  routes: [
    {
      path: '/meet/m/:meetingId',
      component: () => import('./pages/MeetingPage.svelte'),
      get title() {
        return t('title')
      },
      permission: MEET_PERMISSIONS.join,
      capability: 'calls',
    },
  ],

  /**
   * Starting a meeting from the keyboard, and the only way to start one in this slice.
   *
   * It really starts one: `meetings.start` writes the row and the LiveKit room name, and the
   * command then opens that meeting with `?join=1` — "I have already agreed" — so pressing it puts
   * somebody in a call rather than at a door they just asked to walk through. A command that
   * navigated to an id the server had never heard of would 404, which is the shape of dead control
   * this project keeps finding.
   *
   * The work is behind a dynamic `import()` because everything `module.ts` reaches statically is
   * imported by the shell's registry at build time, and that would put the API client and this
   * module's whole in-memory mock into the first paint of every Kern page.
   */
  commands: [
    {
      id: 'meet.start',
      get label() {
        return t('command_start')
      },
      icon: 'video',
      permission: MEET_PERMISSIONS.start,
      capability: 'calls',
      run: async (ctx) => {
        if (!ctx.workspaceId) return
        const { startMeeting } = await import('./start.js')
        const id = await startMeeting(ctx.workspaceId)
        if (id) ctx.navigate(`/meet/m/${id}?join=1`)
        else ctx.toast({ title: t('error_title'), kind: 'error' })
      },
    },
  ],
})

export default meetClientModule
