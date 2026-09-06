import { scopedT } from '@kernhq/ui'

export { ar, de, en, fa, type MeetMessageKey, meetMessageBundles, tr } from './messages.js'

/** `t('nav')` — the module id is implied. `t('common.save')` still reaches the shared bundle. */
export const t = scopedT('meet')
