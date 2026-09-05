-- Row-level security. Hand-written, because drizzle-kit does not generate it.
--
-- **Every statement here is idempotent, and that is not decoration.** `create policy` has no
-- `if not exists` at all, so each one is preceded by an explicit drop. A module's migrations are the
-- first thing the kernel runs, so a replay that throws does not break meetings — it stops the host
-- service binding its port and takes every other module in that service down with it. `core` hosts
-- five today. A replay is routine rather than exotic: drizzle keys applied migrations by content
-- hash, so editing any file in this folder makes the whole folder run again.
--
-- (There is no `add constraint` in this file. The two check constraints live inside `create table`
-- in `0000_init.sql`, where they inherit its `if not exists`. Anything added here later that cannot
-- be written inline needs a `drop constraint if exists` in front of it for the same reason the
-- policies need their drop.)
--
-- This is the last line, not the first: the API checks membership, capability and permission before
-- any of this is reached. It exists for the query that skips them — a job, a report, a mistake — and
-- for anyone who reaches the database another way. A tenant table without a policy is simply
-- readable.
--
-- **`force`, not just `enable`.** A table's owner is exempt from its own policies unless the table
-- forces them, and the owner is exactly who the service connects as. Without `force` every policy
-- below would be decorative in the one deployment that matters. Superusers bypass RLS whatever the
-- table says, which is why `isolation.test.ts` opens a `nosuperuser nobypassrls` role: asserted as
-- the development superuser, these policies are indistinguishable from no policies at all.
--
-- **The `'*'` arm, and why it is a literal sentinel rather than "unbound".**
-- Two writers in this module have no workspace to bind, because nothing about them starts from a
-- request: the LiveKit webhook, which arrives from the media server carrying a room name and a
-- signature, and the sweeps, which are woken by a clock. Both bind `app.workspace_id = '*'`
-- deliberately. The alternative — a policy that admitted a transaction with *nothing* bound — would
-- make forgetting to bind a leak instead of a refusal, and forgetting is the failure that actually
-- happens. With this shape an unbound session reads `current_setting('app.workspace_id', true)` as
-- NULL, both arms evaluate to NULL, and it sees nothing.
--
-- One measured detail for whoever writes those jobs (Postgres 18.3, 2026-09-06): once a session has
-- set `app.workspace_id`, there is no way back to NULL. `reset "app.workspace_id"` and
-- `set_config('app.workspace_id', null, false)` both leave it as the **empty string**. Both states
-- are refusals here, and they are not the same test — `isolation.test.ts` asserts each separately,
-- and reaches the NULL one with a connection that has never bound anything.
--
-- **Nothing binds `'*'` as of this commit.** The webhook, the reconciler and the ring-expiry sweep
-- all arrive in later slices; the arm is written now so that adding them is a change to a job rather
-- than a widening of a policy under time pressure. Each table below names which of the two the arm
-- is there for.

-- `rooms` — the star arm is for the reconciler, which walks live meetings across every workspace at
-- once and resolves the room a `kind = 'room'` meeting belongs to. Nothing else in this module is
-- expected to read a room without a workspace: the rooms page, the room screen and every mutation
-- are request-bound.
alter table "mod_meet"."rooms" enable row level security;--> statement-breakpoint
alter table "mod_meet"."rooms" force row level security;--> statement-breakpoint
drop policy if exists "rooms_ws_isolation" on "mod_meet"."rooms";--> statement-breakpoint
create policy "rooms_ws_isolation" on "mod_meet"."rooms"
  using (current_setting('app.workspace_id', true) = '*' or workspace_id::text = current_setting('app.workspace_id', true))
  with check (current_setting('app.workspace_id', true) = '*' or workspace_id::text = current_setting('app.workspace_id', true));--> statement-breakpoint

-- `meetings` — the star arm is for the LiveKit webhook and the reconciler. The webhook is handed a
-- room name and a signature and nothing else, so it has to find the meeting before it can know which
-- workspace it is in; the reconciler asks LiveKit what rooms exist and closes the meetings whose
-- room is gone, which is a question about every workspace at once.
alter table "mod_meet"."meetings" enable row level security;--> statement-breakpoint
alter table "mod_meet"."meetings" force row level security;--> statement-breakpoint
drop policy if exists "meetings_ws_isolation" on "mod_meet"."meetings";--> statement-breakpoint
create policy "meetings_ws_isolation" on "mod_meet"."meetings"
  using (current_setting('app.workspace_id', true) = '*' or workspace_id::text = current_setting('app.workspace_id', true))
  with check (current_setting('app.workspace_id', true) = '*' or workspace_id::text = current_setting('app.workspace_id', true));--> statement-breakpoint

-- `participants` — the star arm is for the LiveKit webhook and the reconciler, which are the **only**
-- two writers this table has. A browser never reports its own attendance: a client that does reports
-- it wrong the moment it crashes, and the row left behind claims somebody is in a call they left.
alter table "mod_meet"."participants" enable row level security;--> statement-breakpoint
alter table "mod_meet"."participants" force row level security;--> statement-breakpoint
drop policy if exists "participants_ws_isolation" on "mod_meet"."participants";--> statement-breakpoint
create policy "participants_ws_isolation" on "mod_meet"."participants"
  using (current_setting('app.workspace_id', true) = '*' or workspace_id::text = current_setting('app.workspace_id', true))
  with check (current_setting('app.workspace_id', true) = '*' or workspace_id::text = current_setting('app.workspace_id', true));--> statement-breakpoint

-- `invites` — the star arm is for the ring-expiry sweep, the reconciler's sibling: it ages every
-- `ringing` row past `expires_at` into `missed` on a short clock, across every workspace, which is
-- what turns an unanswered call into a missed one somebody can ring back from. Its index
-- (`meet_invites_expiry_idx`) deliberately does not start with `workspace_id` for the same reason.
alter table "mod_meet"."invites" enable row level security;--> statement-breakpoint
alter table "mod_meet"."invites" force row level security;--> statement-breakpoint
drop policy if exists "invites_ws_isolation" on "mod_meet"."invites";--> statement-breakpoint
create policy "invites_ws_isolation" on "mod_meet"."invites"
  using (current_setting('app.workspace_id', true) = '*' or workspace_id::text = current_setting('app.workspace_id', true))
  with check (current_setting('app.workspace_id', true) = '*' or workspace_id::text = current_setting('app.workspace_id', true));
