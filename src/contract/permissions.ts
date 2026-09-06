import { definePermissions } from '@kernhq/contracts'

/**
 * `<module>.<resource>.<action>`, each with the narrowest scope that works and the roles that hold
 * it by default. A workspace can add or remove any of them afterwards with a custom role.
 *
 * A key with nothing checking it is a role editor full of switches that do nothing, so the list is
 * short and each entry names the procedure that asks for it. `meet.call.join` is asked for by
 * `meetings.join` and by `config.get`; `meet.call.start` by `meetings.start`. **`meet.call.host` is
 * asked for by nothing yet** — moderation is a later slice, and if it is cut then `meet.call.host`
 * is deleted in the same commit rather than left behind as a switch that changes nothing.
 *
 * `meet.room.manage` is deliberately **not** here. Rooms are a later slice with a capability of
 * their own, and a permission for a screen nobody can reach is the same lie one item earlier.
 */
export const meetPermissions = definePermissions([
  {
    /**
     * Answering a call, entering a room, joining a huddle — everything that ends in a LiveKit token.
     *
     * Held by `guest` as well as by members: a guest of a workspace who is rung has to be able to
     * answer, and a person who cannot join a meeting cannot be in one, which makes every other
     * permission here moot for them.
     */
    key: 'meet.call.join',
    label: 'Join meetings',
    description: 'Answer a call, enter a room, or join a huddle that is already running.',
    scope: 'workspace',
    defaultRoles: ['owner', 'admin', 'member', 'guest'],
    dangerous: false,
  },
  {
    /**
     * Ringing somebody, or starting a huddle or a meeting that did not exist a moment ago.
     *
     * Separate from joining because starting a call interrupts other people — it makes a device
     * somewhere ring — and plenty of workspaces are happy for a guest to be reachable without
     * letting them reach everybody. Not `dangerous`: it destroys nothing and it is what the product
     * is for.
     */
    key: 'meet.call.start',
    label: 'Start meetings and call people',
    description: 'Ring a colleague, start a huddle from a conversation, or open a meeting.',
    scope: 'workspace',
    defaultRoles: ['owner', 'admin', 'member'],
    dangerous: false,
  },
  {
    /**
     * Acting on somebody else inside a live meeting: muting them, removing them, ending it for
     * everyone.
     *
     * `dangerous: true` because it is power over other people rather than over your own session, and
     * because the role editor marks it so an administrator granting it is told what it is. The
     * person who started a meeting can always end their own, which is not this permission — this is
     * the one that reaches into a meeting somebody else started.
     */
    key: 'meet.call.host',
    label: 'Moderate live meetings',
    description: 'Mute or remove another participant, or end a meeting for everyone in it.',
    scope: 'workspace',
    defaultRoles: ['owner', 'admin'],
    dangerous: true,
  },
])
