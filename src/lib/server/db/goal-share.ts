import { supabase } from './client';
import { isUniqueViolation, storageFailed } from './errors';
import { generateShareToken } from '$lib/server/share/token';
import type { SharedSnapshot } from '$lib/server/share/snapshot';

/**
 * A share link, as the owner sees it.
 *
 * `snapshot` is typed loosely here rather than as `SharedSnapshot` — this is
 * the owner-scoped read, and a row this code itself just wrote is trusted
 * without a parse. The public read (`getLiveByToken`) is the one that crosses
 * a deploy boundary and needs the Zod schema in `$lib/schemas/share.ts`; see
 * `src/routes/s/[token]/+page.server.ts`.
 */
export interface ShareRow {
	id: number;
	user_id: number;
	goal_id: number;
	token: string;
	title: string | null;
	display_name: string | null;
	snapshot: SharedSnapshot | null;
	snapshot_at: string | null;
	revoked_at: string | null;
	created_at: string;
}

/**
 * What the public route is allowed to read. Explicit rather than `ShareRow`
 * with fields ignored — see `getLiveByToken`.
 */
export interface PublicShareRow {
	token: string;
	title: string | null;
	display_name: string | null;
	/** Unparsed. The caller runs it through `sharedSnapshotSchema` — see there for why. */
	snapshot: unknown;
	snapshot_at: string | null;
	user_id: number;
	goal_id: number;
}

export interface IssueFields {
	title: string | null;
	display_name: string | null;
}

/**
 * Shared goal links.
 *
 * One row per `(user_id, goal_id)`, enforced by the table's own unique
 * constraint rather than by a check here — see `migration.sql`. A row that is
 * revoked reads as though it does not exist to every method below except
 * `issue`, which is what makes sharing the same goal again after a revoke
 * reactivate the row instead of failing on the constraint.
 */
export class GoalShareDAO {
	private static instance: GoalShareDAO;

	private constructor() {}

	static getInstance(): GoalShareDAO {
		if (!GoalShareDAO.instance) {
			GoalShareDAO.instance = new GoalShareDAO();
		}
		return GoalShareDAO.instance;
	}

	/** The runner's live link for one goal, or null — a revoked link reads as null too. */
	async getForGoal(userId: number, goalId: number): Promise<ShareRow | null> {
		const { data, error } = await supabase
			.from('goal_share')
			.select('*')
			.eq('user_id', userId)
			.eq('goal_id', goalId)
			.is('revoked_at', null)
			.maybeSingle();

		if (error) storageFailed('share link read', error);
		return (data as ShareRow | null) ?? null;
	}

	/**
	 * Give this goal a live link with a fresh token — creating the row if none
	 * exists, rotating the token in place if one does, and reactivating it if
	 * it was revoked.
	 *
	 * `UPDATE … WHERE user_id = … AND goal_id = …` first (no `revoked_at`
	 * filter: a revoked row is exactly the one this should reactivate), falling
	 * back to an `INSERT` when nothing matched. Deliberately not an upsert: the
	 * row-cap trigger is `BEFORE INSERT`, and Postgres fires that on the
	 * `ON CONFLICT DO UPDATE` path too, so upserting would refuse to rotate a
	 * token on a row that already exists once a runner is at the cap — a
	 * regenerate failing for the reason "you have too many links". This way the
	 * trigger only ever fires when a row is genuinely being added.
	 *
	 * A unique violation on the insert means two requests raced to create the
	 * same row; the loser reads back what the winner wrote rather than
	 * treating the race as a failure, the same way `NewsReadStateDAO.advanceMark`
	 * does for the read-state tables.
	 *
	 * Callers decide when to call this: the `POST` endpoint calls it only when
	 * `getForGoal` found nothing, which is what makes creating idempotent; the
	 * `PUT` endpoint (an explicit "create new link") calls it unconditionally.
	 */
	async issue(userId: number, goalId: number, fields: IssueFields): Promise<ShareRow> {
		const token = generateShareToken();
		const fieldsToWrite = {
			token,
			title: fields.title,
			display_name: fields.display_name,
			revoked_at: null
		};

		const { data: updated, error: updateError } = await supabase
			.from('goal_share')
			.update(fieldsToWrite)
			.eq('user_id', userId)
			.eq('goal_id', goalId)
			.select()
			.maybeSingle();

		if (updateError) storageFailed('share link issue', updateError);
		if (updated) return updated as ShareRow;

		const { data: inserted, error: insertError } = await supabase
			.from('goal_share')
			.insert({ user_id: userId, goal_id: goalId, ...fieldsToWrite })
			.select()
			.single();

		if (!insertError) return inserted as ShareRow;

		if (isUniqueViolation(insertError)) {
			const existing = await this.getForGoal(userId, goalId);
			if (existing) return existing;
		}

		storageFailed('share link issue', insertError);
	}

	/**
	 * Revoke the runner's live link for this goal, clearing the published
	 * snapshot in the same statement — not just the door to it, the copy
	 * itself, so "stop sharing this" removes the data and not only access to
	 * it. The row survives so the goal can be shared again later.
	 *
	 * Idempotent: revoking a link that is already revoked, or that never
	 * existed, matches no row and answers `{ revoked: false }` rather than an
	 * error.
	 */
	async revoke(userId: number, goalId: number): Promise<{ revoked: boolean }> {
		const { data, error } = await supabase
			.from('goal_share')
			.update({ revoked_at: new Date().toISOString(), snapshot: null, snapshot_at: null })
			.eq('user_id', userId)
			.eq('goal_id', goalId)
			.is('revoked_at', null)
			.select('id');

		if (error) storageFailed('share link revoke', error);
		return { revoked: (data ?? []).length > 0 };
	}

	/**
	 * Write the snapshot for a live link.
	 *
	 * One `UPDATE … WHERE user_id = … AND goal_id = … AND revoked_at IS NULL`.
	 * No staleness condition — every owner page load writes this, on purpose:
	 * the shared page mixes this snapshot with a live read of
	 * `prediction_history`, and a snapshot that lagged the history table by a
	 * throttle window could anchor a forecast on a prediction the history
	 * beside it had already moved past. See "One consistency unit" in
	 * `.kiro/specs/goal-sharing/design.md`.
	 *
	 * A row that does not match — no share for this goal, or a revoked one —
	 * is the ordinary case for most runners, and `{ written: false }` says so
	 * without it being a failure.
	 */
	async refreshSnapshot(
		userId: number,
		goalId: number,
		snapshot: SharedSnapshot
	): Promise<{ written: boolean }> {
		const { data, error } = await supabase
			.from('goal_share')
			.update({ snapshot, snapshot_at: new Date().toISOString() })
			.eq('user_id', userId)
			.eq('goal_id', goalId)
			.is('revoked_at', null)
			.select('id');

		if (error) storageFailed('share snapshot refresh', error);
		return { written: (data ?? []).length > 0 };
	}

	/**
	 * The public read. The only query a visitor can cause, and the only one in
	 * this class without a `user_id` filter — scoped instead by the token's own
	 * unique index, which is the whole capability a link grants.
	 *
	 * Returns null for a token that does not exist and for a revoked one
	 * alike: the caller must not be able to tell those apart, or the route
	 * becomes an oracle for which tokens were once real. `maybeSingle`, not
	 * `single` — `single` raises when nothing matches, and nothing matching is
	 * the ordinary case here, not a failure of this app's own database.
	 */
	async getLiveByToken(token: string): Promise<PublicShareRow | null> {
		const { data, error } = await supabase
			.from('goal_share')
			.select('token, title, display_name, snapshot, snapshot_at, user_id, goal_id')
			.eq('token', token)
			.is('revoked_at', null)
			.maybeSingle();

		if (error) storageFailed('share link read', error);
		return (data as PublicShareRow | null) ?? null;
	}
}

export const goalShareDAO = GoalShareDAO.getInstance();
