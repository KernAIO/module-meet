/**
 * The oRPC contract: every procedure this module promises, as data.
 *
 * **Empty, on purpose.** A procedure declared here and not implemented in the router is a lie that
 * compiles — it type-checks perfectly and 404s at runtime — so a contract entry arrives in the same
 * commit as the handler that answers it. This slice builds the schema the handlers will write to and
 * the checks that hold them; the first procedures arrive with the server that can mint a token.
 *
 * `module.test.ts` walks this object and the router together. Its loops are written to work over the
 * empty set and to start meaning something the moment the first entry lands here, rather than being
 * written afterwards when the contract is "finished" — which is the point at which nobody wants to
 * discover that half of it forgot a middleware.
 *
 * Nothing is mounted under `/api/meet` while this is empty.
 */
export const meetContract = {}
export type MeetContract = typeof meetContract
