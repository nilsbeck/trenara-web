import { describe, it, expect } from 'vitest';
import type { ScheduledTraining, Shoe } from '$lib/server/trenara/types';
import {
	activityLabel,
	chipSettings,
	heightLabel,
	selectedStep,
	sessionSettings,
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
		expect(surfaceLabel('single_track')).toBe('Trail');
		// "lights" is the API's own spelling, not a typo on our side.
		expect(heightLabel('lights')).toBe('Rolling');
		expect(activityLabel(null)).toBe('Run');
		expect(activityLabel('road_bike')).toBe('Cycling');
		expect(shoeTypeLabel('supershoe')).toBe('Race shoe');
	});

	it('renders values it has never seen rather than dropping them', () => {
		// The cross_type list is known to be incomplete, so an unregistered value
		// has to survive as something readable.
		expect(activityLabel('open_water')).toBe('Open water');
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
		expect(keys).toEqual(['terrain', 'shoe', 'effort', 'workout']);
	});

	it('drops the running-only settings on a cross-trained session', () => {
		const keys = sessionSettings(bikeRide()).map((s) => s.key);
		expect(keys).not.toContain('terrain');
		expect(keys).not.toContain('shoe');
		expect(keys).toContain('activity');
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

	it('never chips the activity or the workout — the identity strip shows those', () => {
		const chips = chipSettings(bikeRide()).map((c) => c.key);
		expect(chips).not.toContain('activity');
		expect(chips).not.toContain('workout');
	});

	it('chips a removed cool-down, because that deviates from the plan', () => {
		const removed = tempoRun({ can_toggle_cooldown: true, has_cooldown: false });
		const chip = chipSettings(removed).find((c) => c.key === 'cooldown');
		expect(chip?.chipLabel).toBe('No cool-down');
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
