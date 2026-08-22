import type {
	ChangePackage,
	ChangeStep,
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
	'terrain' | 'shoe' | 'effort' | 'volume' | 'cooldown' | 'activity' | 'workout';

/** When a setting earns a place on the chip rail. */
export type ChipRule =
	/** Part of the session's standing setup — shown even when unset. */
	| 'always'
	/** Only once it differs from what the coach planned. */
	| 'changed'
	/** Never: the identity strip already shows it. */
	| 'never';

export interface Setting {
	key: SettingKey;
	label: string;
	/** Current value, or null when nothing is set yet. */
	value: string | null;
	/** Shown on the chip in place of `value` (the cool-down reads "No cool-down"). */
	chipLabel?: string;
	/** True when this differs from the coach's plan. */
	changed: boolean;
	chip: ChipRule;
	/** Replacing the session rather than tuning it — grouped apart in the sheet. */
	replace?: boolean;
	/** Acts on a block rather than the session, so it lives on the block. */
	inline?: boolean;
}

/**
 * Surfaces, in the order the app offers them.
 *
 * `single_track` is a trail, but a narrow one — wide enough for a single
 * runner. It is labelled for what it is rather than as "Trail", because the
 * app also offers an unpaved road, and the difference between a technical
 * single track and a wide dirt road is the whole point of asking.
 *
 * That unpaved-road option is missing here: we have not seen the value the API
 * uses for it. An unrecognised surface still renders under its own name (see
 * `surfaceLabel`), so a session set to it elsewhere reads correctly — it just
 * cannot be chosen from this app yet.
 */
export const SURFACES = [
	{ value: 'road', label: 'Road' },
	{ value: 'athletics_track', label: 'Athletics track' },
	{ value: 'treadmill', label: 'Treadmill' },
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
 * The app offers seven choices — keep as a run, cycling, MTB, swimming, cross
 * trainer, elliptical bike, indoor cycling — and exactly one of their wire
 * values has been observed: `road_bike`, which the app calls Cycling. The rest
 * are deliberately absent rather than guessed. Two of them are near-synonyms in
 * English (cross trainer, elliptical bike), so a plausible-looking guess would
 * be as likely to pick the wrong one as the right one, and a `cross_type` the
 * API does not know is refused the same way a bad surface is.
 *
 * This is a display registry, not a whitelist: a session already cross-trained
 * to an unregistered type still renders, under its own humanised name.
 */
export const ACTIVITIES = [
	{ crossType: null, label: 'Run' },
	{ crossType: 'road_bike', label: 'Cycling' }
] as const;

/**
 * The activities the app lists, for the ones whose value we have not captured.
 *
 * Kept next to `ACTIVITIES` so the gap is visible rather than forgotten: when a
 * capture names a value, it moves up.
 */
export const UNMAPPED_ACTIVITIES = [
	'MTB',
	'Swimming',
	'Cross trainer',
	'Elliptical bike',
	'Indoor cycling'
] as const;

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

export function activityLabel(crossType: string | null | undefined): string {
	return ACTIVITIES.find((a) => a.crossType === (crossType ?? null))?.label ?? humanise(crossType!);
}

export function shoeTypeLabel(type: string): string {
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
		return { value: step?.text ?? null, changed: false, chip: 'always' };
	}
	return { value: step?.text ?? null, changed: !!step && step.value !== 0, chip: 'changed' };
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

/** True when the training is a run rather than a cross-trained session. */
export function isRun(training: ScheduledTraining): boolean {
	return !training.cross_type;
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
			chip: 'always'
		});

		settings.push({
			key: 'shoe',
			label: 'Shoe',
			value: training.suggested_shoe ? shoeName(training.suggested_shoe) : null,
			changed: false,
			chip: 'always'
		});
	}

	if (training.can_change_intensity && training.change_intensity_package) {
		const pkg = training.change_intensity_package;
		settings.push({
			key: 'effort',
			label: 'Effort',
			...packageSetting(pkg, selectedStep(pkg))
		});
	}

	if (training.can_change_distance && training.change_distance_package) {
		const pkg = training.change_distance_package;
		settings.push({
			// "Volume" covers both shapes this package takes: a percentage of the
			// planned distance, or a number of repetitions.
			key: 'volume',
			label: 'Volume',
			...packageSetting(pkg, selectedStep(pkg))
		});
	}

	// Only sessions that have a cool-down can drop one — plenty of runs have
	// none, and those cannot gain one. Its control lives on the block itself,
	// since that is what it acts on and it is already on screen.
	if (training.can_toggle_cooldown) {
		settings.push({
			key: 'cooldown',
			label: 'Cool-down',
			value: training.has_cooldown ? 'On' : 'Removed',
			chipLabel: 'No cool-down',
			changed: !training.has_cooldown,
			chip: 'changed',
			inline: true
		});
	}

	if (training.can_cross_train) {
		settings.push({
			key: 'activity',
			label: 'Activity',
			value: activityLabel(training.cross_type),
			changed: !run,
			chip: 'never',
			replace: true
		});
	}

	if (training.can_be_exchanged) {
		settings.push({
			key: 'workout',
			label: 'Workout',
			value: training.title,
			changed: false,
			chip: 'never',
			replace: true
		});
	}

	return settings;
}

/** The subset of `sessionSettings` that appears on the chip rail. */
export function chipSettings(training: ScheduledTraining): Setting[] {
	return sessionSettings(training).filter(
		(s) => s.chip === 'always' || (s.chip === 'changed' && s.changed)
	);
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
