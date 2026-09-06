import { createModuleClient, type KernClientOptions } from '@kernhq/sdk'
import type { ContractRouterClient } from '@orpc/contract'
import type { MeetContract } from '../contract/index.js'

/** The typed client, derived from the contract — no hand-written method list to drift. */
export type MeetApi = ContractRouterClient<MeetContract>

export function createMeetClient(opts: KernClientOptions): MeetApi {
  return createModuleClient<MeetApi>(opts, 'meet')
}
