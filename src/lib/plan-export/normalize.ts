import type {
	Entry,
	Goal,
	Schedule,
	ScheduledTraining,
	StrengthTraining,
	TrainingBlock,
	ChangePackage
} from '../server/trenara/types';
import { dayKeyOf, mondayOf, toLocalDateString } from '../utils/date';

/**
 * A plan, flattened into something a spreadsheet or a diff can read.
 *
 * The Trenara week payload is shaped for a screen: distances arrive in whatever
 * unit reads best on that row (`m` on an interval, `km` on the long run), paces
 * as seconds-per-unit beside a rendered string, and the applied intensity is
 * not a field at all but the `selected` flag inside a package of offers. None
 * of that survives a comparison — `800` and `0.8` are the same block, and a
 * column that is metres on one row and kilometres on the next cannot be
 * subtracted from anything.
 *
 * So every measurement here is normalised to one unit and one name: distance in
 * km, time in seconds, pace in seconds per km. The untouched upstream payload
 * travels alongside in the export's `raw` key, so nothing this module chose not
 * to model is lost.
 */

/** Metres per kilometre, and the mile, for the two units seen on a block. */
const UNIT_TO_KM: Record<string, number> = { m: 0.001, km: 1, mi: 1.609344 };

export interface PlanBlock {
	/**
	 * Position within the session, dotted through nesting: `4` is the fourth
	 * top-level block, `4.2` the second child of a repeat group. Flat `order` is
	 * 1-based *within its parent* and so repeats across a session — this does
	 * not, which is what makes a block addressable in a diff.
	 */
	path: string;
	/** Structural role: `warmup`, `core`, `run`, `rest`. Not the activity. */
	type: string;
	/** Whether the block is defined by `distance` or by `time`. */
	prior: string | null;
	/** How many times a group repeats; `null` on a leaf block. */
	repeat: number | null;
	/** Repeats of every enclosing group multiplied together. 1 at the top level. */
	repeat_context: number;
	distance_km: number | null;
	time_sec: number | null;
	pace_sec_per_km: number | null;
	/** Slow end of the pace range, i.e. the LARGER seconds-per-km. */
	pace_range_slow_sec_per_km: number | null;
	/** Fast end, i.e. the smaller. */
	pace_range_fast_sec_per_km: number | null;
	text: string | null;
}

export interface PlanSessionAdjustments {
	/**
	 * Percentage of the authored pace, i.e. `100 + selected step`. Read from the
	 * package rather than `training_condition.intensity`: the whole condition is
	 * null until terrain is set, even on a session whose intensity *is* changed.
	 */
	intensity_pct: number | null;
	intensity_step_text: string | null;
	/**
	 * The selected step of the distance package. A percentage on a steady run
	 * and a repetition count on an interval session — never do arithmetic on
	 * it, which is why the text rides along.
	 */
	distance_step_value: number | null;
	distance_step_text: string | null;
	has_cooldown: boolean | null;
	surface: string | null;
	height_difference: string | null;
	suggested_shoe: string | null;
}

export interface PlanSession {
	id: number;
	/** `YYYY-MM-DD`, or null on a row whose date did not parse. */
	date: string | null;
	training_week: number;
	title: string;
	/** The session's own `type`, e.g. the coach's category for it. */
	session_type: string;
	/** The activity it was swapped to, `null` for a run. */
	cross_type: string | null;
	description: string;
	total_distance_km: number | null;
	total_time_sec: number | null;
	/** Core aggregates cover the repeated work only — rests excluded. */
	core_distance_km: number | null;
	core_time_sec: number | null;
	/** Mean pace implied by the totals. Null on a session with no distance. */
	avg_pace_sec_per_km: number | null;
	adjustments: PlanSessionAdjustments;
	capabilities: Record<string, boolean | null>;
	blocks: PlanBlock[];
}

export interface PlanStrengthSession {
	id: number;
	date: string | null;
	title: string;
	training_type: string;
	description: string;
	exercise_count: number;
	exercises: string[];
}

export interface PlanEntry {
	id: number;
	date: string | null;
	name: string;
	type: string;
	cross_type: string | null;
	distance_km: number | null;
	time_sec: number | null;
	pace_sec_per_km: number | null;
	avg_heartbeat: number | null;
	total_altitude: number | null;
	rpe: number | null;
	source: string;
}

export interface PlanWeek {
	training_week: number;
	/** Monday of the week, `YYYY-MM-DD`. */
	week_start: string | null;
	type: string;
	session_count: number;
	planned_distance_km: number;
	planned_time_sec: number;
	completed_distance_km: number;
	completed_time_sec: number;
}

export interface PlanExport {
	meta: {
		generated_at: string;
		from: string;
		to: string;
		timezone: string;
		weeks_requested: number;
		source: string;
	};
	goal: {
		id: number;
		name: string;
		start_date: string;
		end_date: string;
		distance_km: number | null;
		days_to_goal: number | null;
	} | null;
	weeks: PlanWeek[];
	sessions: PlanSession[];
	strength: PlanStrengthSession[];
	entries: PlanEntry[];
	raw?: Schedule[];
}

/** A finite number, or null for anything else — `undefined`, `null`, `NaN`. */
function num(value: number | null | undefined): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Round to `places`, keeping null null rather than turning it into 0. */
function round(value: number | null, places: number): number | null {
	if (value === null) return null;
	const factor = 10 ** places;
	return Math.round(value * factor) / factor;
}

/**
 * A distance in km, whatever unit the row happened to use.
 *
 * An unrecognised unit answers null rather than passing the number through:
 * a silent wrong unit is worse in a comparison than a visible gap.
 */
export function toKm(
	value: number | null | undefined,
	unit: string | null | undefined
): number | null {
	const amount = num(value);
	if (amount === null) return null;
	const factor = UNIT_TO_KM[(unit ?? 'km').toLowerCase()];
	return factor === undefined ? null : amount * factor;
}

/**
 * Seconds per km from a pace value and its unit.
 *
 * `pace_unit` names the pace, not the distance — every capture holds
 * `'min/km'`, where the sibling `distance_unit` holds a bare `'km'` or `'m'`.
 * So the denominator is taken from after the slash when there is one, and the
 * whole string when there is not; anything else answers null rather than
 * guessing, since a pace silently read as per-mile is a 60% error that still
 * looks like a plausible pace.
 */
export function toPacePerKm(
	value: number | null | undefined,
	unit: string | null | undefined
): number | null {
	const seconds = num(value);
	if (seconds === null || seconds === 0) return null;
	const denominator = (unit ?? 'km').toLowerCase().split('/').pop() ?? 'km';
	const factor = UNIT_TO_KM[denominator.trim()];
	return factor === undefined || factor === 0 ? null : seconds / factor;
}

/** The `value` and `text` of whichever step a package has marked selected. */
function selectedStep(
	pkg: ChangePackage | null | undefined
): { value: number; text: string } | null {
	const step = pkg?.steps?.find((candidate) => candidate.selected);
	return step ? { value: step.value, text: step.text } : null;
}

/**
 * Every block of a session, nesting flattened into addressable rows.
 *
 * Group blocks are kept as rows of their own rather than dropped: the repeat
 * count is part of the session's shape, and a diff that saw only leaves could
 * not tell 3x1000m from 5x1000m at the group.
 */
export function flattenBlocks(
	blocks: TrainingBlock[] | undefined,
	prefix = '',
	repeatContext = 1
): PlanBlock[] {
	if (!Array.isArray(blocks)) return [];

	return blocks.flatMap((block, index) => {
		const path = prefix ? `${prefix}.${index + 1}` : String(index + 1);
		const repeat = num(block.repeat);
		const row: PlanBlock = {
			path,
			type: block.type,
			prior: block.prior ?? null,
			repeat,
			repeat_context: repeatContext,
			distance_km: round(toKm(block.distance_value, block.distance_unit), 4),
			time_sec: num(block.time_in_sec) ?? num(block.time_value),
			pace_sec_per_km: round(toPacePerKm(block.pace_value, block.pace_unit), 1),
			pace_range_slow_sec_per_km: round(
				toPacePerKm(block.pace_range_value_min, block.pace_unit),
				1
			),
			pace_range_fast_sec_per_km: round(
				toPacePerKm(block.pace_range_value_max, block.pace_unit),
				1
			),
			text: block.text ?? null
		};

		return [row, ...flattenBlocks(block.blocks, path, repeatContext * (repeat ?? 1))];
	});
}

/** One scheduled training, normalised. */
export function normalizeSession(training: ScheduledTraining, trainingWeek: number): PlanSession {
	const intensity = selectedStep(training.change_intensity_package);
	const distance = selectedStep(training.change_distance_package);

	// `total_distance_in_km` is full precision where `total_distance_value` is
	// rounded, so prefer it and fall back only when it is absent.
	const totalKm =
		num(training.training?.total_distance_in_km) ??
		toKm(training.training?.total_distance_value, training.training?.total_distance_unit);
	const totalSec = num(training.training?.total_time_in_sec);

	return {
		id: training.id,
		date: dayKeyOf(training.day_long),
		training_week: trainingWeek,
		title: training.title,
		session_type: training.type,
		cross_type: training.cross_type ?? null,
		description: training.description,
		total_distance_km: round(totalKm, 4),
		total_time_sec: totalSec,
		core_distance_km: round(
			toKm(training.training?.core_distance_value, training.training?.core_distance_unit),
			4
		),
		core_time_sec: num(training.training?.core_time_in_sec),
		avg_pace_sec_per_km:
			totalKm !== null && totalKm > 0 && totalSec !== null ? round(totalSec / totalKm, 1) : null,
		adjustments: {
			intensity_pct: intensity ? 100 + intensity.value : null,
			intensity_step_text: intensity?.text ?? null,
			distance_step_value: distance?.value ?? null,
			distance_step_text: distance?.text ?? null,
			has_cooldown: training.has_cooldown ?? null,
			surface: training.training_condition?.surface ?? null,
			height_difference: training.training_condition?.height_difference ?? null,
			suggested_shoe: training.suggested_shoe?.name ?? null
		},
		capabilities: {
			can_be_edited: training.can_be_edited ?? null,
			can_change_distance: training.can_change_distance ?? null,
			can_change_intensity: training.can_change_intensity ?? null,
			can_change_pacing_plan: training.can_change_pacing_plan ?? null,
			can_cross_train: training.can_cross_train ?? null,
			can_toggle_cooldown: training.can_toggle_cooldown ?? null,
			can_be_exchanged: training.can_be_exchanged ?? null
		},
		blocks: flattenBlocks(training.training?.blocks)
	};
}

/** One strength session, normalised. Exercises are named, not fully described. */
export function normalizeStrength(strength: StrengthTraining): PlanStrengthSession {
	const exercises = Array.isArray(strength.exercises) ? strength.exercises : [];
	return {
		id: strength.id,
		date: dayKeyOf(strength.day),
		title: strength.title,
		training_type: strength.training_type,
		description: strength.description,
		exercise_count: exercises.length,
		exercises: exercises.map((exercise) => exercise.name)
	};
}

/** One completed activity, normalised. */
export function normalizeEntry(entry: Entry): PlanEntry {
	const km = toKm(entry.distance_value, entry.distance_unit);
	return {
		id: entry.id,
		date: dayKeyOf(entry.start_time),
		name: entry.name,
		type: entry.type,
		cross_type: entry.cross_type ?? null,
		distance_km: round(km, 4),
		time_sec: num(entry.time_in_sec),
		pace_sec_per_km: round(toPacePerKm(entry.pace_value, entry.pace_unit), 1),
		avg_heartbeat: num(entry.avg_heartbeat),
		total_altitude: num(entry.total_altitude),
		rpe: num(entry.rpe),
		source: entry.garmin
			? 'garmin'
			: entry.strava
				? 'strava'
				: entry.polar
					? 'polar'
					: entry.trenara
						? 'trenara'
						: 'unknown'
	};
}

/** Sum of a field across rows, treating null as absent rather than as zero. */
function sum(values: (number | null)[]): number {
	return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

/**
 * Whether a `YYYY-MM-DD` falls inside `[from, to]`, both ends included.
 *
 * String comparison rather than Date arithmetic: these are already zero-padded
 * ISO days, so lexical order *is* chronological order, and no timezone gets a
 * chance to move a session onto the wrong side of a boundary.
 */
export function withinRange(date: string | null, from: string, to: string): boolean {
	return date !== null && date >= from && date <= to;
}

/**
 * Fold the fetched weeks into one export.
 *
 * Weeks are requested by Monday, so the first and last of them reach outside
 * the range asked for; every row is filtered by its own date rather than by the
 * week that carried it, so `from`/`to` mean exactly what they say.
 */
export function buildExport(
	schedules: Schedule[],
	options: {
		from: string;
		to: string;
		goal: Goal | null;
		timezone: string;
		source: string;
		includeRaw: boolean;
		now?: Date;
	}
): PlanExport {
	const { from, to, goal, timezone, source, includeRaw } = options;
	const now = options.now ?? new Date();

	const sessions: PlanSession[] = [];
	const strength: PlanStrengthSession[] = [];
	const entries: PlanEntry[] = [];
	const weeks: PlanWeek[] = [];

	for (const schedule of schedules) {
		const weekSessions = (schedule.trainings ?? [])
			.map((training) => normalizeSession(training, schedule.training_week))
			.filter((session) => withinRange(session.date, from, to));
		const weekStrength = (schedule.strength_trainings ?? [])
			.map(normalizeStrength)
			.filter((session) => withinRange(session.date, from, to));
		const weekEntries = (schedule.entries ?? [])
			.map(normalizeEntry)
			.filter((entry) => withinRange(entry.date, from, to));

		sessions.push(...weekSessions);
		strength.push(...weekStrength);
		entries.push(...weekEntries);

		// A week whose every row fell outside the range contributed nothing, so
		// it gets no summary row either — an all-zero week reads as a rest week
		// rather than as an edge of the export.
		if (weekSessions.length === 0 && weekStrength.length === 0 && weekEntries.length === 0) {
			continue;
		}

		const anchor = weekSessions[0]?.date ?? weekEntries[0]?.date ?? weekStrength[0]?.date ?? null;
		weeks.push({
			training_week: schedule.training_week,
			week_start: anchor ? isoMondayOf(anchor) : null,
			type: schedule.type,
			session_count: weekSessions.length,
			planned_distance_km: round(sum(weekSessions.map((s) => s.total_distance_km)), 3) ?? 0,
			planned_time_sec: sum(weekSessions.map((s) => s.total_time_sec)),
			completed_distance_km: round(sum(weekEntries.map((e) => e.distance_km)), 3) ?? 0,
			completed_time_sec: sum(weekEntries.map((e) => e.time_sec))
		});
	}

	const byDate = (a: { date: string | null }, b: { date: string | null }) =>
		(a.date ?? '').localeCompare(b.date ?? '');
	sessions.sort(byDate);
	strength.sort(byDate);
	entries.sort(byDate);
	weeks.sort((a, b) => (a.week_start ?? '').localeCompare(b.week_start ?? ''));

	return {
		meta: {
			generated_at: now.toISOString(),
			from,
			to,
			timezone,
			weeks_requested: schedules.length,
			source
		},
		goal: goal
			? {
					id: goal.id,
					name: goal.name,
					start_date: goal.start_date,
					end_date: goal.end_date,
					distance_km: round(toKm(goal.distance_value, goal.distance_unit), 4),
					days_to_goal: daysBetween(now, goal.end_date)
				}
			: null,
		weeks,
		sessions,
		strength,
		entries,
		...(includeRaw ? { raw: schedules } : {})
	};
}

/** The Monday of the week containing a `YYYY-MM-DD`, as a `YYYY-MM-DD`. */
function isoMondayOf(date: string): string | null {
	const [year, month, day] = date.split('-').map(Number);
	if (!year || !month || !day) return null;
	return toLocalDateString(mondayOf(new Date(year, month - 1, day)));
}

/** Whole days from `now` to a `YYYY-MM-DD`-prefixed date, or null if unreadable. */
function daysBetween(now: Date, target: string | null | undefined): number | null {
	const key = dayKeyOf(target);
	if (!key) return null;
	const [year, month, day] = key.split('-').map(Number);
	const end = new Date(year, month - 1, day).getTime();
	const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	return Math.round((end - start) / 86_400_000);
}
