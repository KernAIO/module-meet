import { defineClientModule } from '@kernhq/ui'

/**
 * This module as the shell sees it.
 *
 * Everything the interface offers is declared here — navigation, routes, commands, widgets,
 * settings pages, sidebars, presenters — and the shell renders whatever it finds. There are no
 * route files in the app to keep in step: deleting this package removes the feature completely,
 * which is the test of whether something is a module at all.
 *
 * **It offers nothing yet, and it is registered nowhere.** Every contribution added later carries
 * `capability`, so a workspace that has not switched meetings on never meets one:
 *
 * - `permission` — may *this person* reach it. Somebody else in the workspace may well see it.
 * - `capability` — does *this workspace* have the feature. Nobody sees it when off, and the API
 *   behind it answers 404 rather than 403.
 *
 * Both are filters, never a disabled state: a contribution that cannot be used is not rendered.
 */
export const meetClientModule = defineClientModule({
  id: 'meet',
  name: 'Meetings',
  icon: 'video',
})

export default meetClientModule
