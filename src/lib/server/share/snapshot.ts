import type { Goal, UserStats } from '$lib/server/trenara/types';

/**
 * The goal card's inputs, and nothing else.
 *
 * Every field here is one `goal-card.svelte` actually reads — the list was
 * taken from the component, not guessed — and everything else Trenara sends
 * about a goal, an account or a training week is deliberately absent. A
 * `Goal` carries `intermediate_goals`, `can_be_edited`, `overrule_time`; a
 * `UserStats` carries `flat_stats` and four other distances. None of it is
 * needed to draw this card, so none of it is published.
 *
 * `goal.description` is not carried. The API stopped sending it, and a
 * free-text field is the one place a goal could hold something personal.
 *
 * This is what a share link publishes, and changing it is a privacy decision:
 * see `$lib/schemas/share.ts` for how a stored one is read back, and
 * "Evolving the snapshot" in `.kiro/specs/goal-sharing/design.md` for the rule
 * on changing its shape once rows exist.
 */
export interface SharedSnapshot {
	/** Schema version, so a shape change can be recognised rather than crash. */
	v: 1;
	goal: {
		name: string;
		start_date: string;
		end_date: string;
		distance: string;
		distance_unit: string;
		distance_value: number;
		time: string;
		time_in_sec: number;
		pace: string;
	};
	best_times: {
		time_for_goal: string;
		pace_for_goal: string;
	};
	/**
	 * The plan's weeks — planned and completed kilometres. This is what the
	 * forecast is priced from (`readPlanWeeks`), and it is also the compliance
	 * record: it says which weeks were run short. Included knowingly; the
	 * forecast is the point of the page and cannot be drawn without it.
	 */
	plan_weeks: UserStats['graph_stats']['goal'];
}

/**
 * Build a snapshot from what a page load already has in hand.
 *
 * Null when the goal or the stats do not carry what the card needs to say
 * anything — no name or dates, or no current prediction — so a share row is
 * never overwritten with a projection that would only draw the "not updated
 * yet" state anyway.
 */
export function projectSnapshot(goal: Goal, stats: UserStats): SharedSnapshot | null {
	const timeForGoal = stats.best_times?.time_for_goal;
	const paceForGoal = stats.best_times?.pace_for_goal;
	const planWeeks = stats.graph_stats?.goal;

	if (
		!goal.name ||
		!goal.start_date ||
		!goal.end_date ||
		!timeForGoal ||
		!paceForGoal ||
		!planWeeks
	) {
		return null;
	}

	return {
		v: 1,
		goal: {
			name: goal.name,
			start_date: goal.start_date,
			end_date: goal.end_date,
			distance: goal.distance,
			distance_unit: goal.distance_unit,
			distance_value: goal.distance_value,
			time: goal.time,
			time_in_sec: goal.time_in_sec,
			pace: goal.pace
		},
		best_times: {
			time_for_goal: timeForGoal,
			pace_for_goal: paceForGoal
		},
		plan_weeks: planWeeks
	};
}
