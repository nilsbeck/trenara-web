import type { Schedule, ScheduledTraining, Entry } from '../lib/server/trenara/types';

/**
 * A week payload trimmed to the fields this module reads, transcribed from the
 * captures pinned in `src/lib/server/trenara/payloads.test.ts`.
 *
 * Deliberately not the full capture: the point of these tests is the
 * normalisation, and a fixture carrying eighty untouched fields hides which
 * three the assertion actually depends on. The shapes stay honest because the
 * fixture is typed against the same interfaces the client is.
 */

export function makeTraining(overrides: Partial<ScheduledTraining> = {}): ScheduledTraining {
	return {
		id: 127477832,
		day: 1787436000,
		day_long: '2026-09-02',
		title: 'Endurance run',
		description: 'Steady aerobic work.',
		show_description_from: 0,
		type: 'endurance',
		icon_url: 'https://example.test/icon.png',
		hex_training: '#44A6D3',
		hex_completed: null,
		last_garmin_sync: null,
		can_be_edited: true,
		training: {
			blocks: [
				{
					order: 1,
					type: 'warmup',
					prior: 'distance',
					time_in_sec: 400,
					distance_value: 1,
					distance_unit: 'km',
					pace_value: 400,
					pace_unit: 'min/km',
					text: 'Warm up 1km'
				},
				{
					order: 2,
					type: 'core',
					repeat: 3,
					blocks: [
						{
							order: 1,
							type: 'run',
							prior: 'distance',
							time_in_sec: 200,
							distance_value: 800,
							distance_unit: 'm',
							pace_value: 250,
							pace_unit: 'min/km',
							pace_range_value_min: 259,
							pace_range_value_max: 241,
							text: 'Run 800m'
						},
						{
							order: 2,
							type: 'rest',
							prior: 'time',
							time_in_sec: 120,
							distance_value: null,
							distance_unit: null,
							pace_value: null,
							text: 'Rest 2:00'
						}
					]
				}
			],
			total_time_in_sec: 4068,
			total_distance_in_km: 12.0934,
			core_time_in_sec: 3285,
			core_distance_value: 10,
			core_distance_unit: 'km',
			core_time: '54:45',
			core_time_value: 3285,
			core_time_unit: 'sec',
			total_distance: '12.09km',
			total_distance_value: 12.09,
			total_distance_unit: 'km',
			total_time: '01:07:48',
			total_time_value: 4068,
			total_time_unit: 'sec'
		},
		can_change_intensity: true,
		change_intensity_package: {
			title: 'Intensity',
			text: 'Scale the pace',
			steps: [
				{ step: 1, value: -2, text: 'A bit slower', selected: true },
				{ step: 2, value: 0, text: 'As planned', selected: false }
			]
		},
		can_change_distance: true,
		change_distance_package: {
			title: 'Distance',
			text: 'Scale the volume',
			steps: [
				{ step: 1, value: -10, text: '-10%', selected: false },
				{ step: 2, value: 0, text: 'As planned', selected: true }
			]
		},
		can_toggle_cooldown: true,
		has_cooldown: true,
		can_cross_train: true,
		can_be_exchanged: true,
		can_change_pacing_plan: false,
		...overrides
	};
}

export function makeEntry(overrides: Partial<Entry> = {}): Entry {
	return {
		id: 55123,
		name: 'Morning run',
		start_time: '2026-09-02T06:41:00+02:00',
		type: 'running',
		icon: 'run',
		total_altitude: 84,
		avg_heartbeat: 148,
		rpe: 5,
		comment: null,
		strava: false,
		strava_url: null,
		garmin: true,
		polar: false,
		trenara: false,
		distance: '12.09km',
		distance_value: 12.09,
		distance_unit: 'km',
		distance_unit_text: 'km',
		time: '01:07:48',
		time_in_sec: 4068,
		time_value: 4068,
		time_unit: 'sec',
		pace: '05:36 min/km',
		pace_value: 336,
		pace_unit: 'min/km',
		allow_shoe: true,
		ask_feedback: false,
		cross_type: null,
		cross_percentage: null,
		cross_percentage_min: null,
		cross_percentage_max: null,
		gps_media: [],
		...overrides
	} as Entry;
}

export function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
	return {
		id: 9001,
		start_day: 1787436000,
		start_day_long: '2026-08-31',
		training_week: 12,
		type: 'ultimate',
		trainings: [makeTraining()],
		strength_trainings: [],
		entries: [makeEntry()],
		...overrides
	};
}
