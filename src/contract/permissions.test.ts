/**
 * The Meetings permission matrix, blessed rather than assumed.
 *
 * Defaults are declared one permission at a time, which makes the whole picture — which built-in
 * role ends up holding what — impossible to read from any single line. This writes it out in full
 * and compares it against what the module declares. Rows list the *effective* grants, cascade
 * included: the kernel expands declared `defaultRoles` upward through guest ⊆ member ⊆ admin ⊆
 * owner, and `permissionMatrixDiff` applies the same expansion.
 *
 * Changing a default is meant to be deliberate: edit `defaultRoles` → this fails naming every row
 * that moved → confirm that is what you meant → update `BLESSED` in the same commit.
 */
import { permissionMatrixDiff } from '@kernhq/testing'
import { describe, expect, it } from 'vitest'
import { meetPermissions } from './permissions.js'

/** Every built-in role that holds the permission by default, lowest role first. */
const BLESSED: Record<string, readonly string[]> = {
  // A guest who is rung has to be able to answer; a guest who cannot join cannot be in a meeting at
  // all, which makes every other permission here moot for them.
  'meet.call.join': ['guest', 'member', 'admin', 'owner'],
  // Starting a call interrupts somebody — it makes a device ring — so it stops at member.
  'meet.call.start': ['member', 'admin', 'owner'],
  'meet.call.host': ['admin', 'owner'],
}

/**
 * One. `meet.call.host` is power over other people inside a live meeting — muting them, removing
 * them, ending it for everybody — rather than power over your own session, and the role editor marks
 * it so whoever grants it is told what it is. Joining and starting destroy nothing.
 */
const DANGEROUS = ['meet.call.host']

describe('meet permissions', () => {
  it('grants each permission to exactly the blessed roles', () => {
    expect(permissionMatrixDiff(meetPermissions, BLESSED)).toEqual([])
  })

  it('namespaces every key under the module id and declares it once', () => {
    const keys = meetPermissions.map((p) => p.key)
    expect(keys.filter((key) => !key.startsWith('meet.'))).toEqual([])
    expect(keys.filter((key, i) => keys.indexOf(key) !== i)).toEqual([])
  })

  it('marks exactly the destructive permissions dangerous', () => {
    const flagged = meetPermissions.filter((p) => p.dangerous).map((p) => p.key)
    expect(flagged.toSorted()).toEqual(DANGEROUS.toSorted())
  })

  it('declares no permission for a resource this module does not own yet', () => {
    /*
     * Pinned, because the failure mode is silent in the other direction: a key nothing checks is a
     * row in the role editor that changes nothing, and a switchboard full of those teaches an
     * administrator that none of them mean anything.
     *
     * `meet.room.manage` is deliberately absent — rooms are a later slice behind a capability of
     * their own, and the permission arrives with the screen that asks for it. If moderation is cut,
     * `meet.call.host` leaves this list in the same commit for the same reason.
     */
    expect(meetPermissions.map((p) => p.key)).toEqual(['meet.call.join', 'meet.call.start', 'meet.call.host'])
  })
})
