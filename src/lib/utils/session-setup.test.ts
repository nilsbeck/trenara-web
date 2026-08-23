import { describe, it, expect } from 'vitest';
import { TRAINING_SURFACES, type ScheduledTraining, type Shoe } from '$lib/server/trenara/types';
import {
	ACTIVITIES,
	SURFACES,
	UNMAPPED_ACTIVITIES,
	activityLabel,
	chipSettings,
	hasSetupFlags,
	heightLabel,
	selectedStep,
	sessionSettings,
	conditionClimb,
	cooldownBlockIndex,
	elevationBand,
	metresPerKm,
	hasNeutralStep,
	HEIGHT_DIFFERENCES,
	sessionSummary,
	shapeSegments,
	shoeName,
	shoeTypeLabel,
	surfaceLabel
} from './session-setup';

/** A tempo run: conditions and a shoe set, intensity nudged, distance locked. */
function tempoRun(overrides: Partial<ScheduledTraining> = {}): ScheduledTraining {
	return {
		id: 127477827,
		day: 1787349600,
		day_long: '2026-08-22',
		title: 'Tempo run',
		description: 'Tough interval session this week.',
		show_description_from: 1786744800,
		type: 'training',
		icon_url: 'https://example.test/icon.svg',
		hex_training: '#E69F00',
		hex_completed: null,
		last_garmin_sync: null,
		can_be_edited: true,
		can_cross_train: false,
		cross_type: null,
		can_toggle_cooldown: false,
		has_cooldown: false,
		can_change_distance: false,
		change_distance_package: null,
		can_change_intensity: true,
		change_intensity_package: {
			title: 'Fine-tune intensity',
			text: 'Change today’s session intensity.',
			steps: [
				{ step: 1, value: -4, text: 'Slower', selected: false },
				{ step: 2, value: -2, text: 'A bit slower', selected: true },
				{ step: 3, value: 0, text: 'As planned', selected: false }
			]
		},
		can_change_pacing_plan: false,
		change_pacing_plan_package: null,
		can_be_exchanged: true,
		training: {
			blocks: [
				{
					order: 1,
					type: 'warmup',
					hex_graph: '#90CFF1',
					distance_value: 2,
					distance_unit: 'km',
					time_in_sec: 783
				},
				{
					order: 2,
					type: 'core',
					repeat: 1,
					blocks: [
						{
							order: 1,
							type: 'run',
							hex_graph: '#44A6D3',
							distance_value: 8,
							distance_unit: 'km',
							time_in_sec: 2768
						}
					]
				}
			],
			total_time_in_sec: 4068,
			core_time_in_sec: 3285,
			core_time: '54:45',
			core_time_value: 3285,
			core_time_unit: 'sec',
			total_distance: '12km',
			total_distance_value: 12,
			total_distance_unit: 'km',
			total_time: '01:07:48',
			total_time_value: 4068,
			total_time_unit: 'sec'
		},
		training_condition: {
			id: 3828739,
			height_difference: 'flat',
			surface: 'treadmill',
			intensity: 98,
			updated_at: 1787387729,
			height: null,
			height_unit: null
		},
		suggested_shoe: {
			id: 6404,
			brand: 'Adidas',
			name: 'Boston 13',
			type: 'supertrainer',
			preferred: false,
			buy_date: '2026-01-11',
			lifetime_percentage: 30.26,
			created_at: '2026-01-14T09:05:28+01:00',
			updated_at: '2026-01-14T09:05:28+01:00',
			retired_at: null,
			expected_lifetime_distance: '800km',
			expected_lifetime_distance_value: 800,
			expected_lifetime_distance_unit: 'km',
			expected_lifetime_distance_unit_text: 'km',
			distance_done: '242.08km',
			distance_done_value: 242.08,
			distance_done_unit: 'km',
			distance_done_unit_text: 'km',
			avg_pace: '05:05 min/km',
			avg_pace_value: 305,
			avg_pace_unit: 'min/km',
			picture: null
		},
		...overrides
	};
}

/** A session swapped to cycling: no distance, no pace, no conditions, no shoe. */
function bikeRide(): ScheduledTraining {
	return tempoRun({
		title: 'Cycling',
		hex_training: '#1BB9AA',
		cross_type: 'road_bike',
		can_cross_train: true,
		training_condition: null,
		suggested_shoe: null,
		training: {
			blocks: [
				{
					order: 1,
					type: 'core',
					repeat: 1,
					blocks: [
						{
							order: 1,
							type: 'run',
							hex_graph: '#1BB9AA',
							distance_value: null,
							distance_unit: null,
							calc_distance_in_km: null,
							time_in_sec: 6223,
							calc_time_in_sec: 6223
						}
					]
				}
			],
			total_time_in_sec: 6224,
			core_time_in_sec: 6224,
			core_time: '01:43:44',
			core_time_value: 6224,
			core_time_unit: 'sec',
			total_distance: null,
			total_distance_value: null,
			total_time: '01:43:44',
			total_time_value: 6224,
			total_time_unit: 'sec'
		}
	});
}

describe('labels', () => {
	it('maps the API spellings to words a runner recognises', () => {
		expect(surfaceLabel('single_track')).toBe('Single track');
		// "lights" is the API's own spelling, not a typo on our side.
		expect(heightLabel('lights')).toBe('Slightly hilly');
		expect(activityLabel(null)).toBe('Run');
		expect(activityLabel('road_bike')).toBe('Cycling');
		expect(shoeTypeLabel('supershoe')).toBe('Race shoe');
	});

	it('renders values it has never seen rather than dropping them', () => {
		// Five of the app's seven activities have no captured wire value, so an
		// unregistered one has to survive as something readable.
		expect(activityLabel('open_water')).toBe('Open water');
		expect(activityLabel('indoor_cycling')).toBe('Indoor cycling');
		expect(surfaceLabel('gravel_path')).toBe('Gravel path');
		expect(shoeTypeLabel('carbon_plate')).toBe('Carbon plate');
	});

	it('returns null for an unset surface or elevation', () => {
		expect(surfaceLabel(null)).toBeNull();
		expect(heightLabel(undefined)).toBeNull();
	});

	it('treats an "Other" brand as a sentinel for the name carrying the make', () => {
		const shoe = { brand: 'Other', name: 'La Sportiva' } as Shoe;
		expect(shoeName(shoe)).toBe('La Sportiva');
		expect(shoeName({ brand: 'Nike', name: 'Vomero 18' } as Shoe)).toBe('Nike Vomero 18');
	});
});

describe('selectedStep', () => {
	it('finds the current step by its flag, not its position', () => {
		expect(selectedStep(tempoRun().change_intensity_package)?.value).toBe(-2);
	});

	it('is null when the package is absent', () => {
		expect(selectedStep(null)).toBeNull();
		expect(selectedStep(undefined)).toBeNull();
	});
});

describe('sessionSettings', () => {
	it('offers only what the training says it allows', () => {
		const keys = sessionSettings(tempoRun()).map((s) => s.key);
		// No volume: can_change_distance is false. No activity: can_cross_train is.
		expect(keys).toEqual(['terrain', 'shoe', 'effort', 'session']);
	});

	it('drops the running-only settings on a cross-trained session', () => {
		const keys = sessionSettings(bikeRide()).map((s) => s.key);
		expect(keys).not.toContain('terrain');
		expect(keys).not.toContain('shoe');
		expect(keys).toContain('session');
	});

	it('labels terrain with both halves of the condition', () => {
		const terrain = sessionSettings(tempoRun()).find((s) => s.key === 'terrain');
		expect(terrain?.value).toBe('Treadmill · Flat');
	});

	it('leaves terrain and shoe unset rather than inventing a default', () => {
		const training = tempoRun({ training_condition: null, suggested_shoe: null });
		const settings = sessionSettings(training);
		expect(settings.find((s) => s.key === 'terrain')?.value).toBeNull();
		expect(settings.find((s) => s.key === 'shoe')?.value).toBeNull();
	});

	it('marks a step that differs from the plan as changed', () => {
		expect(sessionSettings(tempoRun()).find((s) => s.key === 'effort')?.changed).toBe(true);
	});

	it('does not mark the planned step as changed', () => {
		const training = tempoRun({
			change_intensity_package: {
				title: 'Fine-tune intensity',
				text: '',
				steps: [{ step: 3, value: 0, text: 'As planned', selected: true }]
			}
		});
		expect(sessionSettings(training).find((s) => s.key === 'effort')?.changed).toBe(false);
	});

	it('omits a change it has a flag for but no package to drive', () => {
		// The flag alone cannot render a control: the steps only exist in the package.
		const training = tempoRun({ can_change_intensity: true, change_intensity_package: null });
		expect(sessionSettings(training).map((s) => s.key)).not.toContain('effort');
	});

	it('offers the cool-down only where there is one to drop', () => {
		expect(sessionSettings(tempoRun()).map((s) => s.key)).not.toContain('cooldown');
		const withCooldown = tempoRun({ can_toggle_cooldown: true, has_cooldown: true });
		expect(sessionSettings(withCooldown).map((s) => s.key)).toContain('cooldown');
	});
});

describe('chipSettings', () => {
	it('shows the standing setup always and a dial only once it differs', () => {
		const chips = chipSettings(tempoRun()).map((c) => c.key);
		expect(chips).toEqual(['terrain', 'shoe', 'effort']);
	});

	it('hides a dial sitting at the planned value', () => {
		const training = tempoRun({
			change_intensity_package: {
				title: 'Fine-tune intensity',
				text: '',
				steps: [{ step: 3, value: 0, text: 'As planned', selected: true }]
			}
		});
		expect(chipSettings(training).map((c) => c.key)).toEqual(['terrain', 'shoe']);
	});

	it('never chips the session itself — the identity strip shows it', () => {
		expect(chipSettings(bikeRide()).map((c) => c.key)).not.toContain('session');
	});

	it('never chips the cool-down — the block list already shows it is gone', () => {
		// A chip would spend a row of the rail repeating what the plan says in
		// the place the block is missing from.
		const removed = tempoRun({ can_toggle_cooldown: true, has_cooldown: false });
		expect(chipSettings(removed).map((c) => c.key)).not.toContain('cooldown');
		// It is still a setting, still marked as differing from the plan.
		const setting = sessionSettings(removed).find((s) => s.key === 'cooldown');
		expect(setting?.changed).toBe(true);
	});

	it('never disagrees with the sheet about a setting it shows', () => {
		// The two views render from one list, so every chip must match its row.
		const training = tempoRun({ can_toggle_cooldown: true, has_cooldown: false });
		const all = sessionSettings(training);
		for (const chip of chipSettings(training)) {
			expect(all).toContainEqual(chip);
		}
	});
});

describe('shapeSegments', () => {
	it('weighs blocks by distance where the training has any', () => {
		const segments = shapeSegments(tempoRun());
		expect(segments).toEqual([
			{ weight: 2, color: '#90CFF1' },
			{ weight: 8, color: '#44A6D3' }
		]);
	});

	it('expands a repeated group so intervals read as a comb', () => {
		const training = tempoRun();
		training.training.blocks = [
			{
				order: 1,
				type: 'core',
				repeat: 4,
				blocks: [
					{ order: 1, type: 'run', hex_graph: '#D55E00', distance_value: 400, distance_unit: 'm' },
					{ order: 2, type: 'rest', hex_graph: '#94a3b8', distance_value: 200, distance_unit: 'm' }
				]
			}
		];
		expect(shapeSegments(training)).toHaveLength(8);
	});

	it('converts metres so a 400m rep does not dwarf a 2km warm-up', () => {
		const training = tempoRun();
		training.training.blocks = [
			{ order: 1, type: 'warmup', hex_graph: '#90CFF1', distance_value: 2, distance_unit: 'km' },
			{ order: 2, type: 'run', hex_graph: '#D55E00', distance_value: 400, distance_unit: 'm' }
		];
		const [warmup, rep] = shapeSegments(training);
		expect(warmup.weight).toBe(2);
		expect(rep.weight).toBe(0.4);
	});

	it('falls back to time on a cross-trained session, which has no distance', () => {
		const segments = shapeSegments(bikeRide());
		expect(segments).toHaveLength(1);
		expect(segments[0].weight).toBeGreaterThan(0);
		expect(segments[0].color).toBe('#1BB9AA');
	});

	it('skips blocks carrying neither a distance nor a time', () => {
		const training = tempoRun();
		training.training.blocks = [{ order: 1, type: 'run', hex_graph: '#fff' }];
		expect(shapeSegments(training)).toEqual([]);
	});
});

describe('cooldownBlockIndex', () => {
	function withBlocks(types: string[], overrides: Partial<ScheduledTraining> = {}) {
		const training = tempoRun({ can_toggle_cooldown: true, has_cooldown: true, ...overrides });
		training.training.blocks = types.map((type, i) => ({
			order: i + 1,
			type,
			distance_value: 1,
			distance_unit: 'km'
		}));
		return training;
	}

	it('finds the cool-down block by its type', () => {
		expect(cooldownBlockIndex(withBlocks(['warmup', 'core', 'cooldown']))).toBe(2);
	});

	it('accepts the spellings the API might use', () => {
		expect(cooldownBlockIndex(withBlocks(['warmup', 'cool_down']))).toBe(1);
		expect(cooldownBlockIndex(withBlocks(['warmup', 'Cooldown']))).toBe(1);
	});

	it('does not mistake the warm-up for it', () => {
		expect(cooldownBlockIndex(withBlocks(['warmup', 'core']))).toBe(-1);
	});

	it('returns -1 rather than guessing when no block names itself', () => {
		// Mislabelling a core block would be worse than not finding one — the
		// caller renders a row of its own instead.
		expect(cooldownBlockIndex(withBlocks(['warmup', 'core', 'run']))).toBe(-1);
	});

	it('returns -1 once the cool-down has been dropped', () => {
		const training = withBlocks(['warmup', 'core'], { has_cooldown: false });
		expect(cooldownBlockIndex(training)).toBe(-1);
	});

	it('takes the last match, since a cool-down closes the session', () => {
		expect(cooldownBlockIndex(withBlocks(['cooldown', 'core', 'cooldown']))).toBe(2);
	});
});

describe('packages without an "as planned" step', () => {
	/** An interval session: the distance package counts reps, not percentages. */
	function intervals() {
		return tempoRun({
			title: 'Intervals',
			can_change_distance: true,
			change_distance_package: {
				title: 'Fine-tune intervals',
				text: 'Adjust the number of repetitions.',
				steps: [
					{ step: 1, value: 1, text: '1x', selected: false },
					{ step: 2, value: 2, text: '2x', selected: true },
					{ step: 3, value: 3, text: '3x', selected: false }
				]
			}
		});
	}

	it('recognises which packages carry a neutral step', () => {
		expect(hasNeutralStep(tempoRun().change_intensity_package)).toBe(true);
		expect(hasNeutralStep(intervals().change_distance_package)).toBe(false);
		expect(hasNeutralStep(null)).toBe(false);
	});

	it('does not call a repetition count changed', () => {
		// 2x is selected, and 2 !== 0 — but there is no 0 step, so nothing says
		// the coach planned anything other than 2x. Marking it changed would put
		// a deviation badge on a session nobody has touched.
		const volume = sessionSettings(intervals()).find((s) => s.key === 'volume');
		expect(volume?.value).toBe('2x');
		expect(volume?.changed).toBe(false);
	});

	it('shows it on the rail anyway, since it cannot be hidden as "unchanged"', () => {
		// A "changed"-gated chip would never appear, and 2x is worth seeing.
		const chips = chipSettings(intervals()).map((c) => c.key);
		expect(chips).toContain('volume');
	});

	it('still flags a percentage package that has left the plan', () => {
		const training = tempoRun({
			can_change_distance: true,
			change_distance_package: {
				title: 'Fine-tune distance',
				text: '',
				steps: [
					{ step: 1, value: -30, text: '-30%', selected: true },
					{ step: 2, value: 0, text: '0%', selected: false }
				]
			}
		});
		const volume = sessionSettings(training).find((s) => s.key === 'volume');
		expect(volume?.changed).toBe(true);
	});

	it('keeps the chip off a percentage package sitting at the plan', () => {
		const training = tempoRun({
			can_change_distance: true,
			change_distance_package: {
				title: 'Fine-tune distance',
				text: '',
				steps: [
					{ step: 1, value: -30, text: '-30%', selected: false },
					{ step: 2, value: 0, text: '0%', selected: true }
				]
			}
		});
		expect(chipSettings(training).map((c) => c.key)).not.toContain('volume');
	});
});

describe('climb on a condition', () => {
	it('reads the metres the write side names', () => {
		const training = tempoRun();
		training.training_condition = {
			id: 1,
			height_difference: 'strong',
			surface: 'single_track',
			updated_at: 0,
			height: null,
			height_value: 450,
			height_unit: 'm'
		};
		expect(conditionClimb(training)).toBe(450);
	});

	it('falls back to the other field reads carry it in', () => {
		const training = tempoRun();
		training.training_condition = {
			id: 1,
			height_difference: 'strong',
			surface: 'road',
			updated_at: 0,
			height: 300,
			height_unit: 'm'
		};
		expect(conditionClimb(training)).toBe(300);
	});

	it('is 0 when nothing is set, so the label has nothing to show', () => {
		expect(conditionClimb(tempoRun({ training_condition: null }))).toBe(0);
	});

	it('joins the terrain label once there is a climb to report', () => {
		const training = tempoRun();
		training.training_condition = {
			id: 1,
			height_difference: 'strong',
			surface: 'single_track',
			updated_at: 0,
			height: null,
			height_value: 450,
			height_unit: 'm'
		};
		const terrain = sessionSettings(training).find((s) => s.key === 'terrain');
		expect(terrain?.value).toBe('Single track · Very hilly · 450 m');
	});

	it('leaves a zero climb out of the label', () => {
		// Every session without a climb would otherwise carry a "0 m" nobody
		// asked about, on the chip as well as the row.
		const terrain = sessionSettings(tempoRun()).find((s) => s.key === 'terrain');
		expect(terrain?.value).toBe('Treadmill · Flat');
	});
});

describe('elevation bands', () => {
	it('uses the thresholds the app publishes', () => {
		expect(elevationBand(0)).toBe('flat');
		expect(elevationBand(2.9)).toBe('flat');
		expect(elevationBand(3)).toBe('lights');
		expect(elevationBand(10)).toBe('lights');
		expect(elevationBand(11)).toBe('strong');
		expect(elevationBand(20)).toBe('strong');
		expect(elevationBand(20.1)).toBe('mountain');
	});

	it('leaves no gap between "up to 10" and "from 11"', () => {
		// The published bands skip the range between them; a real route does not.
		expect(elevationBand(10.5)).toBe('lights');
	});

	it('divides the ascent by the session distance', () => {
		const training = tempoRun();
		// 12 km at full precision on this fixture.
		expect(metresPerKm(training, 120)).toBeCloseTo(10);
		expect(metresPerKm(training, 360)).toBeCloseTo(30);
	});

	it('has nothing to report without an ascent or a distance', () => {
		expect(metresPerKm(tempoRun(), 0)).toBeNull();

		const noDistance = tempoRun();
		noDistance.training.total_distance_in_km = undefined;
		noDistance.training.total_distance_value = null;
		expect(metresPerKm(noDistance, 400)).toBeNull();
	});

	it('describes every band it can return', () => {
		// The sheet looks the band up by value to label it; a band with no entry
		// would render as nothing at all.
		for (const metres of [0, 5, 15, 40]) {
			const band = elevationBand(metres);
			expect(HEIGHT_DIFFERENCES.some((h) => h.value === band)).toBe(true);
		}
	});

	it('gives every option the threshold it stands for', () => {
		for (const height of HEIGHT_DIFFERENCES) {
			expect(height.detail).toMatch(/D\+ per km/);
		}
	});
});

describe('surfaces', () => {
	it("sends the API's value, not the app's label", () => {
		// A track posts as "track": athletics_track reads like the app's own
		// label and is answered "The selected surface is invalid". Both this and
		// dirt_road were captured by setting the surface in Trenara's app, which
		// is the only way to learn one — the terrain call carries the elevation
		// too, so a refused surface loses a change the runner did make.
		expect(SURFACES.map((s) => s.value)).toEqual([
			'road',
			'track',
			'treadmill',
			'dirt_road',
			'single_track'
		]);
		expect(SURFACES.map((s) => s.value)).not.toContain('athletics_track');
		expect(TRAINING_SURFACES).not.toContain('athletics_track' as never);
	});

	it('offers every surface the app does', () => {
		expect(SURFACES.map((s) => s.label)).toEqual([
			'Road',
			'Athletics track',
			'Treadmill',
			'Dirt road',
			'Single track'
		]);
	});

	it("names a track by the app's words, not the wire spelling", () => {
		// Humanising "track" would read "Track", which is not what the app calls
		// it — the registered label is what a session set elsewhere shows.
		expect(surfaceLabel('track')).toBe('Athletics track');
		expect(surfaceLabel('dirt_road')).toBe('Dirt road');
	});
});

describe('activities', () => {
	it('registers only the cross type that has been captured', () => {
		// road_bike is the one value seen on the wire. Guessing the others risks
		// picking between near-synonyms — cross trainer and elliptical bike —
		// and a cross_type the API does not know is refused.
		expect(ACTIVITIES.map((a) => a.crossType)).toEqual([null, 'road_bike']);
	});

	it('keeps the unmapped ones named, so the gap stays visible', () => {
		expect(UNMAPPED_ACTIVITIES).toContain('MTB');
		expect(UNMAPPED_ACTIVITIES).toContain('Swimming');
		expect(UNMAPPED_ACTIVITIES).toContain('Cross trainer');
		expect(UNMAPPED_ACTIVITIES).toContain('Elliptical bike');
		expect(UNMAPPED_ACTIVITIES).toContain('Indoor cycling');
	});

	it('does not list an activity as both known and unmapped', () => {
		const known = ACTIVITIES.map((a) => a.label);
		for (const pending of UNMAPPED_ACTIVITIES) {
			expect(known).not.toContain(pending);
		}
	});
});

describe('replacing the session', () => {
	it('offers one entry however many endpoints answer it', () => {
		// cross_train and exchange are two mechanisms for one question, and a
		// runner should not have to know which list holds the answer.
		const both = sessionSettings(tempoRun({ can_cross_train: true, can_be_exchanged: true }));
		expect(both.filter((s) => s.replace).map((s) => s.key)).toEqual(['session']);
	});

	it('still offers it when only one of the two is allowed', () => {
		const exchangeOnly = sessionSettings(
			tempoRun({ can_cross_train: false, can_be_exchanged: true })
		);
		expect(exchangeOnly.map((s) => s.key)).toContain('session');

		const crossOnly = sessionSettings(tempoRun({ can_cross_train: true, can_be_exchanged: false }));
		expect(crossOnly.map((s) => s.key)).toContain('session');
	});

	it('offers nothing when neither is allowed', () => {
		const locked = sessionSettings(tempoRun({ can_cross_train: false, can_be_exchanged: false }));
		expect(locked.map((s) => s.key)).not.toContain('session');
	});

	it('names the row for what the session currently is', () => {
		const session = sessionSettings(bikeRide()).find((s) => s.key === 'session');
		expect(session?.value).toBe('Cycling');
		expect(session?.changed).toBe(true);
	});
});

describe('sessionSummary', () => {
	it('reads distance then duration', () => {
		expect(sessionSummary(tempoRun())).toBe('12km · 01:07:48');
	});

	it('is duration alone on a session with no distance', () => {
		// A ride has a duration and nothing else to report.
		expect(sessionSummary(bikeRide())).toBe('01:43:44');
	});

	it('uses the server\u2019s own formatting rather than reformatting it', () => {
		// The rounding and the unit are its call: a session measured in metres
		// or miles arrives already saying so.
		const training = tempoRun();
		training.training.total_distance = '12.09km';
		expect(sessionSummary(training)).toContain('12.09km');
	});
});

describe('hasSetupFlags', () => {
	it('is false for a training carrying none of the capability flags', () => {
		// The shape the week response is believed to send: schedule fields only.
		const week = {
			id: 1,
			day: 0,
			day_long: '2026-08-22',
			title: 'Tempo run',
			description: '',
			show_description_from: 0,
			type: 'training',
			icon_url: '',
			hex_training: '#E69F00',
			hex_completed: null,
			last_garmin_sync: null,
			can_be_edited: true,
			training: { blocks: [] }
		} as unknown as ScheduledTraining;

		expect(hasSetupFlags(week)).toBe(false);
	});

	it('takes any one flag as the whole set', () => {
		// They travel together in every captured payload, so one is enough to
		// say the serializer included the block — and a copy that has it can
		// render the rail without waiting on the detail fetch.
		const base = { can_be_edited: true } as unknown as ScheduledTraining;

		expect(hasSetupFlags({ ...base, can_cross_train: false })).toBe(true);
		expect(hasSetupFlags({ ...base, can_be_exchanged: false })).toBe(true);
		expect(hasSetupFlags({ ...base, can_change_intensity: false })).toBe(true);
		expect(hasSetupFlags({ ...base, can_change_distance: false })).toBe(true);
		expect(hasSetupFlags({ ...base, can_toggle_cooldown: false })).toBe(true);
	});
});
