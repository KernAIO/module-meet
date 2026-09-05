import type { core } from '@kernhq/contracts'

/**
 * What Meetings will interrupt somebody about.
 *
 * A notification type is the key a person's own preferences are stored under, so two rules follow
 * from that alone: a type declared and never sent is a row in everybody's preferences that changes
 * nothing, and renaming one silently resets everybody who had switched it off.
 *
 * Empty, because nothing sends anything yet. The two this module will have — an incoming call and a
 * missed one — belong to the slice that can actually raise them, and each arrives with its sender.
 */
export const meetNotificationTypes: core.NotificationTypeDef[] = []
