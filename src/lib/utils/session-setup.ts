import type {
	AppConfig,
	ChangePackage,
	ChangeStep,
	PacingPlanOption,
	ScheduledTraining,
	Shoe,
	TrainingBlock,
	TrainingHeightDifference
} from '$lib/server/trenara/types';

/**
 * Session setup: what a runner may change about one planned training, and how
 * it is labelled.
 *
 * The rule that holds throughout: Trenara decides what is changeable. Every
 * option here is gated by a `can_*` flag or a `change_*_package` that arrived
 * with the training, never by a rule about workout types — a tempo run refuses
 * a distance change because the server says so, not because we know it is a
 * tempo run. Titles are localised, so nothing may key off them either.
 */

export type SettingKey =
	'terrain' | 'shoe' | 'effort' | 'volume' | 'cooldown' | 'pacing' | 'session';

export interface Setting {
	key: SettingKey;
	label: string;
	/** Current value, or null when nothing is set yet. */
	value: string | null;
	/** Shown on the chip in place of `value` (the cool-down reads "No cool-down"). */
	chipLabel?: string;
	/**
	 * True when this differs from the coach's plan. Styling only — a changed
	 * chip picks up a dot and a tinted border. It does not decide whether the
	 * chip is there; see `chip`.
	 */
	changed: boolean;
	/**
	 * The field this value comes from is not on this copy of the training at
	 * all, so the value is unknown rather than unset — the detail fetch will
	 * bring it. The chip shows a spinner instead of claiming nothing is set.
	 */
	awaiting?: boolean;
	/**
	 * Whether the setting gets a chip on the rail.
	 *
	 * True for everything the runner can change here, whether or not they have
	 * changed it: the chip is how you find out the option exists at all, which
	 * matters most for the settings the backend always has a value for. False
	 * only where the card already offers the setting somewhere better — the
	 * cool-down on its block, the session in its title.
	 */
	chip: boolean;
	/** Replacing the session rather than tuning it — grouped apart in the sheet. */
	replace?: boolean;
	/** Acts on a block rather than the session, so it lives on the block. */
	inline?: boolean;
}

/**
 * Surfaces, in the order the app offers them — all five of them.
 *
 * The labels are the app's words; the values are the API's, and the two do not
 * match. A track posts as `track`, not `athletics_track` — that spelling reads
 * like the app's own label and is refused with "The selected surface is
 * invalid" — and an unpaved road posts as `dirt_road`. Both values came from
 * setting the surface in Trenara's app and reading what the API returned,
 * which is the only way to learn one: a guess is refused on a call that also
 * carries the elevation and climb the runner did set.
 *
 * `single_track` is a trail, but a narrow one — wide enough for a single
 * runner. It is labelled for what it is rather than as "Trail", because a wide
 * dirt road is a separate option here, and the difference between the two is
 * the whole point of asking.
 */
export const SURFACES = [
	{ value: 'road', label: 'Road' },
	{ value: 'track', label: 'Athletics track' },
	{ value: 'treadmill', label: 'Treadmill' },
	{ value: 'dirt_road', label: 'Dirt road' },
	{ value: 'single_track', label: 'Single track' }
] as const;

/**
 * Elevation, as a four-step scale.
 *
 * The values are spelled the way the API spells them — `lights` reads like an
 * upstream typo for "light", but "light" is not a value we have seen accepted.
 * The labels are the app's own words, which say what the scale means far
 * better than the values do.
 */
export const HEIGHT_DIFFERENCES = [
	{ value: 'flat', label: 'Flat', detail: 'Under 3 m D+ per km' },
	{ value: 'lights', label: 'Slightly hilly', detail: '3–10 m D+ per km' },
	{ value: 'strong', label: 'Very hilly', detail: '11–20 m D+ per km' },
	{ value: 'mountain', label: 'Mountainous', detail: 'Over 20 m D+ per km' }
] as const;

/**
 * Ascent per kilometre, or null when the session has no distance to divide by.
 *
 * Cross-trained sessions have none, and terrain is a running-only setting
 * anyway — but a training whose distance has not loaded yet lands here too.
 */
export function metresPerKm(training: ScheduledTraining, climbMetres: number): number | null {
	const km = training.training?.total_distance_in_km ?? training.training?.total_distance_value;
	if (km == null || km <= 0 || climbMetres <= 0) return null;
	return climbMetres / km;
}

/**
 * Which elevation band an ascent per kilometre falls in.
 *
 * The thresholds are the ones the app itself publishes next to these options:
 * under 3, between 3 and 10, between 11 and 20, over 20. Those are written for
 * whole numbers and leave 10-to-11 unclaimed, so a real route at 10.5 m/km
 * belongs to neither. It is banded as slightly hilly here — the lower of the
 * two, and the reading a runner is less likely to be talked out of.
 */
export function elevationBand(metresPerKilometre: number): TrainingHeightDifference {
	if (metresPerKilometre < 3) return 'flat';
	if (metresPerKilometre < 11) return 'lights';
	if (metresPerKilometre <= 20) return 'strong';
	return 'mountain';
}

/**
 * Activities we can name, keyed by `cross_type` (null being a run).
 *
 * All seven of the app's choices, in the order it lists them: keep as a run,
 * cycling, mountain biking, indoor cycling, swimming, cross trainer, elliptical
 * bike.
 *
 * This is a display registry, not a whitelist: a session already cross-trained
 * to an unregistered type still renders, under its own humanised name — see
 * `activityLabel`.
 */
export const ACTIVITIES = [
	{ crossType: null, label: 'Run' },
	{ crossType: 'road_bike', label: 'Cycling' },
	{ crossType: 'mountain_bike', label: 'Mountain biking' },
	{ crossType: 'indoor_cycling', label: 'Indoor cycling' },
	{ crossType: 'swimming', label: 'Swimming' },
	{ crossType: 'crosstrainer', label: 'Cross trainer' },
	{ crossType: 'elliptical', label: 'Elliptical bike' }
] as const;

/** One choice in the activity picker, from the config or from `ACTIVITIES`. */
export interface Activity {
	crossType: string | null;
	label: string;
	/** Served config only: an SVG on the API host, and the colour that goes with it. */
	iconPath?: string;
	color?: string;
}

/**
 * The activity choices, preferring the served list to ours.
 *
 * The API knows about activities we do not, and orders them; `ACTIVITIES` is
 * what is left when the config could not be fetched. Either way "Run" leads,
 * because reverting is the choice a runner looking at this list most often
 * wants and it is not an activity the config enumerates.
 */
export function activities(config: AppConfig | null | undefined): Activity[] {
	const served = config?.cross_training?.types;
	if (!served?.length) return ACTIVITIES.map((a) => ({ crossType: a.crossType, label: a.label }));

	return [
		{ crossType: null, label: 'Run' },
		...served.map((t) => ({
			crossType: t.type,
			label: t.name,
			iconPath: t.icon_path,
			color: t.color
		}))
	];
}

const SHOE_TYPE_LABELS: Record<string, string> = {
	supertrainer: 'Supertrainer',
	supershoe: 'Race shoe',
	long_run: 'Long run',
	trail: 'Trail'
};

/** Humanise an unregistered enum value: `open_water` becomes "Open water". */
function humanise(value: string): string {
	const spaced = value.replace(/_/g, ' ');
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function surfaceLabel(surface: string | null | undefined): string | null {
	if (!surface) return null;
	return SURFACES.find((s) => s.value === surface)?.label ?? humanise(surface);
}

export function heightLabel(height: string | null | undefined): string | null {
	if (!height) return null;
	return HEIGHT_DIFFERENCES.find((h) => h.value === height)?.label ?? humanise(height);
}

export function activityLabel(
	crossType: string | null | undefined,
	config?: AppConfig | null
): string {
	const wanted = crossType ?? null;
	const served = config?.cross_training?.types?.find((t) => t.type === wanted);
	if (served) return served.name;
	return ACTIVITIES.find((a) => a.crossType === wanted)?.label ?? humanise(crossType!);
}

export function shoeTypeLabel(type: string, config?: AppConfig | null): string {
	const served = config?.shoes?.types?.find((t) => t.tag === type);
	if (served) return served.name;
	return SHOE_TYPE_LABELS[type] ?? humanise(type);
}

/** "Adidas Boston 13" — `brand: 'Other'` is a sentinel, the real make is in `name`. */
export function shoeName(shoe: Shoe): string {
	return shoe.brand === 'Other' ? shoe.name : `${shoe.brand} ${shoe.name}`;
}

/** The step currently applied, or null when the package is absent or unset. */
export function selectedStep(pkg: ChangePackage | null | undefined): ChangeStep | null {
	return pkg?.steps.find((s) => s.selected) ?? null;
}

/**
 * The pacing strategy currently applied, or null when the package is absent
 * or unset.
 *
 * `change_pacing_plan_package` is the array of options itself, not a
 * `ChangePackage` wrapping one — see `PacingPlanOption`.
 */
export function selectedPacingPlan(
	pkg: PacingPlanOption[] | null | undefined
): PacingPlanOption | null {
	return pkg?.find((o) => o.selected) ?? null;
}

/**
 * Whether a package has a step meaning "as the coach planned it".
 *
 * A percentage package has one — 0% on distance, "As planned" on intensity —
 * and anything else is a deviation. A package counting repetitions does not:
 * an interval session offers 1x, 2x, 3x, and `selected` tells us which is
 * applied but never which was planned. So without a zero step there is nothing
 * to call a deviation from, and claiming one would put a "changed" mark on a
 * session nobody has touched.
 */
export function hasNeutralStep(pkg: ChangePackage | null | undefined): boolean {
	return !!pkg?.steps.some((s) => s.value === 0);
}

/**
 * How a package's setting should behave: flagged as changed once it leaves the
 * coach's value, or shown plainly because we cannot tell what that value was.
 */
function packageSetting(
	pkg: ChangePackage,
	step: ChangeStep | null
): Pick<Setting, 'value' | 'changed' | 'chip'> {
	if (!hasNeutralStep(pkg)) {
		return { value: step?.text ?? null, changed: false, chip: true };
	}
	return { value: step?.text ?? null, changed: !!step && step.value !== 0, chip: true };
}

/**
 * Metres of climb on a training's condition, 0 when none is set.
 *
 * Reads carry it as both `height_value` and `height`; the former matches the
 * name the write side uses, so it wins where the two disagree.
 */
export function conditionClimb(training: ScheduledTraining): number {
	const condition = training.training_condition;
	return condition?.height_value ?? condition?.height ?? 0;
}

/**
 * The session's headline numbers: distance and duration, or just duration on a
 * cross-trained session, which has no distance at all.
 *
 * Both come from the server pre-formatted ("12km", "01:07:48") and are used
 * verbatim — the rounding and the unit are its call, and a session measured in
 * metres or miles arrives already saying so.
 */
export function sessionSummary(training: ScheduledTraining): string {
	return [training.training?.total_distance, training.training?.total_time]
		.filter(Boolean)
		.join(' · ');
}

/**
 * Which icon stands for a session's activity.
 *
 * Derived from `cross_type` alone, never from the title: titles are localised
 * and the workout-type list is open-ended, so a second icon set keyed off them
 * would be guesswork. An activity we cannot name gets the generic mark rather
 * than a wrong one.
 */
const BIKE_CROSS_TYPES = new Set(['road_bike', 'mountain_bike', 'indoor_cycling']);

export function activityIcon(crossType: string | null | undefined): 'run' | 'bike' | 'other' {
	if (!crossType) return 'run';
	return BIKE_CROSS_TYPES.has(crossType) ? 'bike' : 'other';
}

/**
 * True when this copy of a training carries the capability block at all.
 *
 * The week response is believed to omit it — the flags are marked "observed
 * only on the detail endpoint" in the types — but nothing in the path would
 * hide them if it did not: the API client casts `res.json()` with no schema to
 * strip by, and the schedule route re-serialises each training whole. So the
 * setup UI asks the copy it has rather than assuming, and renders straight
 * away whenever the flags are already there.
 *
 * Any one of them is taken as the whole set: in every payload captured so far
 * they travel together, the detail endpoint and the exchange list alike.
 */
export function hasSetupFlags(training: ScheduledTraining): boolean {
	return (
		training.can_cross_train !== undefined ||
		training.can_be_exchanged !== undefined ||
		training.can_change_intensity !== undefined ||
		training.can_change_distance !== undefined ||
		training.can_toggle_cooldown !== undefined
	);
}

/**
 * What to call the setup panel on this session.
 *
 * “How you’ll run it” says what the chips are better than a noun does: not
 * settings in the abstract, but the decisions the coach left to the runner —
 * the surface, the shoes, the effort, the race strategy. It also pairs with
 * "Training details" further down the card, which is the coach's half of the
 * same split.
 *
 * A cross-trained session is not run, so it cannot borrow the verb: the same
 * heading over a bike ride would be plainly wrong. Rather than a verb per
 * activity — there are seven, and “how you’ll cross-train it” is not English —
 * the non-run case drops to the neutral form, which is never wrong for any of
 * them.
 */
export function setupHeading(training: ScheduledTraining): string {
	return isRun(training) ? 'How you’ll run it' : 'How you’ll do it';
}

/** True when the training is a run rather than a cross-trained session. */
export function isRun(training: ScheduledTraining): boolean {
	return !training.cross_type;
}

/**
 * How a package-driven setting should render on this copy of the training.
 *
 * Three cases, and the difference between the last two is the whole point:
 * a package present drives the value; a package that is present and null means
 * the control does not exist, so the setting is dropped; a package key missing
 * altogether means this copy does not carry packages, and the setting stands
 * with its value still coming.
 */
function packageOrAwaiting(
	training: ScheduledTraining,
	key: 'change_intensity_package' | 'change_distance_package'
): Pick<Setting, 'value' | 'changed' | 'chip' | 'awaiting'> | null {
	if (!(key in training)) return { value: null, changed: false, chip: true, awaiting: true };

	const pkg = training[key];
	if (!pkg) return null;
	return packageSetting(pkg, selectedStep(pkg));
}

/**
 * Every setting this training allows, in one order.
 *
 * The chip rail and the setup sheet both render from this, so a setting cannot
 * carry a different name, value or position in one than it has in the other.
 * What differs between the two views is only which entries show, per `chip`.
 */
export function sessionSettings(training: ScheduledTraining): Setting[] {
	const settings: Setting[] = [];
	const run = isRun(training);

	// Terrain and shoe are the only two settings with no `can_*` flag of their
	// own, and the backend always has a value for both — a surface, an
	// elevation, a recommended shoe. So they are always shown.
	//
	// `can_be_edited` is not the gate it looks like. The goal race sends it
	// false alongside `can_change_intensity: true` and
	// `can_change_pacing_plan: true`, so it plainly does not mean "nothing here
	// may change"; it tracks edits to the schedule entry, which is what the
	// delete and move-date controls use it for. Reading it as a master switch
	// is what hid the whole rail on race day, and reading it as a gate on these
	// two hid a shoe the server had recommended for the race. If a write is
	// refused, the card says so — which is a better failure than never showing
	// the runner what their race is set up as.
	if (run) {
		const condition = training.training_condition;
		const surface = surfaceLabel(condition?.surface);
		const height = heightLabel(condition?.height_difference);
		const climb = conditionClimb(training);
		settings.push({
			key: 'terrain',
			label: 'Terrain',
			// The climb joins the label only once it is set: on the sessions that
			// have none it would be a "0 m" nobody asked about.
			value: surface
				? [surface, height ?? 'Flat', climb > 0 ? `${climb} m` : null].filter(Boolean).join(' · ')
				: null,
			changed: false,
			chip: true,
			awaiting: !('training_condition' in training)
		});

		settings.push({
			key: 'shoe',
			label: 'Shoe',
			value: training.suggested_shoe ? shoeName(training.suggested_shoe) : null,
			changed: false,
			chip: true,
			awaiting: !('suggested_shoe' in training)
		});
	}

	// The pacing plan is not a `ChangePackage` — `change_pacing_plan_package`
	// is itself the array of three named strategies — so it gets its own
	// awaiting/absent handling rather than going through `packageOrAwaiting`.
	// True only on the goal race; every other session sends `false`.
	//
	// Ahead of the dials, because it is not one: effort and volume tune a
	// session, the pacing plan decides what the session is. It belongs with
	// terrain and shoe as part of the standing setup, and on race day it is the
	// standing setup — the only thing the plan leaves open.
	if (training.can_change_pacing_plan) {
		if (!('change_pacing_plan_package' in training)) {
			settings.push({
				key: 'pacing',
				label: 'Pacing plan',
				value: null,
				changed: false,
				chip: true,
				awaiting: true
			});
		} else if (training.change_pacing_plan_package) {
			settings.push({
				key: 'pacing',
				label: 'Pacing plan',
				value: selectedPacingPlan(training.change_pacing_plan_package)?.title ?? null,
				// No coach-planned default is knowable from the payload — unlike a
				// percentage package, a named strategy has no "0%" to call neutral.
				changed: false,
				chip: true
			});
		}
	}

	// A package that arrived as null is Trenara saying there is no such control,
	// and the setting is omitted. A package key that is *absent* is a copy that
	// does not carry packages at all — the week response, which sends the flags
	// without them — and there the flag is enough to say the chip belongs on the
	// rail. It goes there awaiting its label rather than appearing late and
	// pushing the rest of the rail along.
	const intensity = packageOrAwaiting(training, 'change_intensity_package');
	if (training.can_change_intensity && intensity) {
		settings.push({ key: 'effort', label: 'Effort', ...intensity });
	}

	const distance = packageOrAwaiting(training, 'change_distance_package');
	if (training.can_change_distance && distance) {
		settings.push({
			// "Volume" covers both shapes this package takes: a percentage of the
			// planned distance, or a number of repetitions.
			key: 'volume',
			label: 'Volume',
			...distance
		});
	}

	// Only sessions that have a cool-down can drop one — plenty of runs have
	// none, and those cannot gain one. Its control lives on the block itself,
	// since that is what it acts on and it is already on screen.
	if (training.can_toggle_cooldown && 'has_cooldown' in training) {
		settings.push({
			key: 'cooldown',
			label: 'Cool-down',
			value: training.has_cooldown ? 'On' : 'Removed',
			changed: !training.has_cooldown,
			// No chip. The block list already says the cool-down is gone, in the
			// place it is missing from, and a chip repeating that costs a whole
			// row of the rail to say it a second time.
			chip: false,
			inline: true
		});
	}

	// One row, not two.
	//
	// The API splits "make this session something else" across two endpoints
	// with different id spaces: cross_train takes an activity, exchange takes a
	// candidate workout. That split is real for us and meaningless to a runner,
	// who has one question and would otherwise have to guess which list holds
	// the answer — and they overlap at the edges, since exchange candidates can
	// themselves be cross-trained. So both are offered from a single entry, and
	// which endpoint answers is decided per option rather than up front.
	if (training.can_cross_train || training.can_be_exchanged) {
		settings.push({
			key: 'session',
			label: 'Session',
			value: training.title,
			changed: !run,
			chip: false,
			replace: true
		});
	}

	return settings;
}

/** The subset of `sessionSettings` that appears on the chip rail. */
/**
 * The chip rail: every setting the runner can change from here.
 *
 * There is no "only once it differs" rule any more. Effort and volume always
 * carry a value from the backend, so hiding them at the planned step hid the
 * fact that they could be changed at all — the chip is how you find the option,
 * not just how you read it. Showing them costs nothing now the rail wraps.
 *
 * What stays off is only what the card offers somewhere better: the cool-down
 * on its own block, and the session behind its title.
 */
export function chipSettings(training: ScheduledTraining): Setting[] {
	return sessionSettings(training).filter((s) => s.chip);
}

/**
 * Where the cool-down sits in the training's top-level blocks, or -1 when it
 * cannot be pointed at.
 *
 * The API does not flag which block is the cool-down, so this matches on the
 * block type containing "cool" — the same assumption `blockTypeColor` already
 * makes. A session can report `has_cooldown` while naming its block something
 * we do not recognise, and mislabelling a core block would be worse than not
 * finding one: -1 means the control renders as its own row instead of being
 * attached to the wrong block.
 */
export function cooldownBlockIndex(training: ScheduledTraining): number {
	if (!training.has_cooldown) return -1;

	const blocks = training.training?.blocks ?? [];
	// Searched from the end: a cool-down is the last thing in a session, and a
	// warm-up shares neither the word nor the position.
	for (let i = blocks.length - 1; i >= 0; i--) {
		if ((blocks[i].type ?? '').toLowerCase().includes('cool')) return i;
	}
	return -1;
}

export interface ShapeSegment {
	/** Relative width. Distance where the training has one, otherwise time. */
	weight: number;
	color: string;
}

const FALLBACK_SEGMENT_COLOR = '#60a5fa';

/**
 * Flatten a training's blocks into weighted segments for the shape bar.
 *
 * Repeated groups are expanded so an interval session reads as a comb rather
 * than one solid slab — that pattern is what makes the session type legible at
 * a glance, which a single icon could not do without guessing from a localised
 * title.
 *
 * Weight comes from distance where the training has any and from time where it
 * does not, so a cross-trained session (all distances null) still draws.
 */
export function shapeSegments(training: ScheduledTraining): ShapeSegment[] {
	const segments: ShapeSegment[] = [];

	const push = (block: TrainingBlock) => {
		const weight = blockWeight(block);
		if (weight <= 0) return;
		segments.push({ weight, color: block.hex_graph || FALLBACK_SEGMENT_COLOR });
	};

	for (const block of training.training?.blocks ?? []) {
		if (block.blocks && block.blocks.length > 0) {
			const repeat = block.repeat && block.repeat > 1 ? block.repeat : 1;
			for (let r = 0; r < repeat; r++) {
				for (const sub of block.blocks) push(sub);
			}
		} else {
			push(block);
		}
	}

	return segments;
}

function blockWeight(block: TrainingBlock): number {
	const km = block.calc_distance_in_km ?? distanceInKm(block);
	if (km != null && km > 0) return km;

	const seconds = block.calc_time_in_sec ?? block.time_in_sec;
	// Fall back to time, scaled so a minute of running weighs about as much as
	// the distance it covers. The bar only needs proportions, not units.
	return seconds != null && seconds > 0 ? seconds / 300 : 0;
}

function distanceInKm(block: TrainingBlock): number | null {
	const value = block.distance_value;
	if (value == null) return null;
	return block.distance_unit === 'm' ? value / 1000 : value;
}
