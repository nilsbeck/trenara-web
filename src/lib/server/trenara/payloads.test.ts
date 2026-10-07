import { describe, it, expect } from 'vitest';
import type {
	AddNewTrainingRequest,
	ChatMessagesResponse,
	ProfileUpdate,
	ExchangeCandidate,
	NewTrainingCandidate,
	NewsResponse,
	SaveScheduleResponse,
	Schedule,
	ScheduleChangeRequest,
	ScheduledTrainingDetail,
	Shoe,
	Entry,
	TestScheduleResponse
} from './types';

// ─────────────────────────────────────────────────────────────
// Fixtures transcribed from real Trenara responses.
//
// The point of this file is the `satisfies` clauses: they fail at
// compile time if a type drifts from what the API actually sends.
// For a reverse-engineered API that is the only check that matters —
// there is no schema to validate against, only observed traffic.
// ─────────────────────────────────────────────────────────────

// A tempo run: conditions set, team, shoe, and an intensity package.
const runDetail = {
	id: 127477827,
	day: 1787349600,
	day_long: '2026-08-22',
	title: 'Tempo run',
	description: 'Tough interval session this week, so the tempo run stays fully aerobic.',
	show_description_from: 1786744800,
	type: 'training',
	icon_url: 'https://backend-prod.trenara.com/icons/icon__step.svg',
	hex_training: '#E69F00',
	hex_completed: null,
	last_garmin_sync: '2026-08-22 10:35:45',
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
		text: 'Change today’s session intensity within limits set by Coach Christophe.',
		steps: [
			{ step: 1, value: -4, text: 'Slower', selected: false },
			{ step: 2, value: -2, text: 'A bit slower', selected: true },
			{ step: 3, value: 0, text: 'As planned', selected: false },
			{ step: 4, value: 2, text: 'A bit faster', selected: false }
		]
	},
	can_change_pacing_plan: false,
	change_pacing_plan_package: null,
	can_be_exchanged: true,
	team_data: {
		team_id: 470,
		name: 'Valencia 42k',
		picture: null,
		nr_same_day_participants: 0,
		nr_other_day_participants: 0,
		matches_captain_day: true,
		captain_pace: true,
		can_toggle_pace: false,
		can_show_participant_overview: true
	},
	training: {
		blocks: [
			{
				order: 1,
				type: 'warmup',
				prior: 'distance',
				hex_graph: '#90CFF1',
				calc_time_in_sec: 783,
				hex_text: '#FFFFFF',
				time: '13:03',
				time_in_sec: 783,
				time_value: 783,
				time_unit: 'sec',
				distance: '2km',
				distance_value: 2,
				distance_unit: 'km',
				distance_unit_text: 'km',
				pace: '06:32 min/km',
				pace_value: 392,
				pace_unit: 'min/km',
				pace_per_hour: '9.18 km/h',
				pace_per_hour_value: 392,
				pace_per_hour_unit: 'km/h',
				prefer_pph: true,
				pace_range: '05:59-07:05 min/km',
				pace_range_value_min: 425,
				pace_range_value_max: 359,
				pace_per_hour_range: '8.47-10.03 km/h',
				pace_per_hour_range_value_min: 425,
				pace_per_hour_range_value_max: 359,
				text: 'Warm-up: 2km in 13:03 (05:59-07:05 min/km)',
				text_pph: 'Warm-up: 2km in 13:03 (8.47-10.03 km/h)'
			},
			{
				order: 2,
				repeat: 1,
				type: 'core',
				blocks: [
					{
						order: 1,
						type: 'run',
						prior: 'distance',
						hex_graph: '#44A6D3',
						hex_text: '#FFFFFF',
						time: '23:04',
						time_in_sec: 1384,
						time_value: 1384,
						time_unit: 'sec',
						distance: '4km',
						distance_value: 4,
						distance_unit: 'km',
						distance_unit_text: 'km',
						pace: '05:46 min/km',
						pace_value: 346,
						pace_unit: 'min/km',
						pace_per_hour: '10.40 km/h',
						pace_per_hour_value: 346,
						pace_per_hour_unit: 'km/h',
						prefer_pph: true,
						pace_range: '05:33-05:59 min/km',
						pace_range_value_min: 359,
						pace_range_value_max: 333,
						pace_per_hour_range: '10.03-10.81 km/h',
						pace_per_hour_range_value_min: 359,
						pace_per_hour_range_value_max: 333,
						text: 'Run 4km in 23:04 (05:33-05:59 min/km)',
						text_pph: 'Run 4km in 23:04 (10.03-10.81 km/h)'
					}
				]
			}
		],
		total_time_in_sec: 4068,
		total_distance_in_km: 12,
		core_time_in_sec: 3285,
		pre_advice: null,
		post_advice: null,
		core_distance: '10km',
		core_distance_value: 10,
		core_distance_unit: 'km',
		core_distance_unit_text: 'km',
		core_time: '54:45',
		core_time_value: 3285,
		core_time_unit: 'sec',
		total_distance: '12km',
		total_distance_value: 12,
		total_distance_unit: 'km',
		total_distance_unit_text: 'km',
		total_time: '01:07:48',
		total_time_value: 4068,
		total_time_unit: 'sec'
	},
	training_condition: {
		id: 3828739,
		type: 'SchedulePivot',
		height_difference: 'flat',
		surface: 'treadmill',
		intensity: 98,
		updated_at: 1787387729,
		height: null,
		height_value: null,
		height_unit: null,
		height_unit_text: null
	},
	suggested_shoe: {
		id: 6404,
		brand: 'Adidas',
		name: 'Boston 13',
		type: 'supertrainer',
		preferred: false,
		buy_date: '2026-01-11',
		lifetime_percentage: 30.260000000000005,
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
	}
} satisfies ScheduledTrainingDetail;

// A session swapped to cycling: no distance, no pace, no conditions, no shoe.
const crossTrainDetail = {
	id: 127477833,
	day: 1787522400,
	day_long: '2026-08-24',
	title: 'Cycling',
	description: 'A great alternative! Cycling eliminates the impact stress from running.',
	show_description_from: 1786917600,
	type: 'training',
	icon_url: 'https://backend-prod.trenara.com/icons/cross_training/bike.svg',
	hex_training: '#1BB9AA',
	hex_completed: null,
	last_garmin_sync: '2026-08-21 16:31:25',
	can_be_edited: true,
	can_cross_train: true,
	cross_type: 'road_bike',
	can_toggle_cooldown: false,
	has_cooldown: false,
	can_change_distance: false,
	change_distance_package: null,
	can_change_intensity: true,
	change_intensity_package: {
		title: 'Fine-tune intensity',
		text: 'Change today’s session intensity within limits set by Coach Christophe.',
		steps: [{ step: 3, value: 0, text: 'As planned', selected: true }]
	},
	can_change_pacing_plan: false,
	change_pacing_plan_package: null,
	can_be_exchanged: true,
	team_data: {
		team_id: 470,
		name: 'Valencia 42k',
		picture: null,
		nr_same_day_participants: 0,
		nr_other_day_participants: 0,
		matches_captain_day: true,
		captain_pace: true,
		can_toggle_pace: false,
		can_show_participant_overview: true
	},
	training: {
		blocks: [
			{
				order: 1,
				repeat: 1,
				type: 'core',
				blocks: [
					{
						order: 1,
						type: 'run',
						prior: 'time',
						hex_graph: '#1BB9AA',
						calc_distance_in_km: null,
						calc_time_in_sec: 6223,
						hex_text: '#FFFFFF',
						time: '01:43:43',
						time_in_sec: 6223,
						time_value: 6223,
						time_unit: 'sec',
						distance: null,
						distance_value: null,
						distance_unit: null,
						distance_unit_text: null,
						pace: null,
						pace_value: null,
						pace_unit: null,
						pace_per_hour: null,
						pace_per_hour_value: null,
						pace_per_hour_unit: null,
						prefer_pph: false,
						text: 'Ride 01:43:43',
						text_pph: 'Ride 01:43:43'
					}
				]
			}
		],
		total_time_in_sec: 6224,
		total_distance_in_km: 0,
		core_time_in_sec: 6224,
		core_distance: null,
		core_distance_value: null,
		core_distance_unit: null,
		core_distance_unit_text: null,
		core_time: '01:43:44',
		core_time_value: 6224,
		core_time_unit: 'sec',
		total_distance: null,
		total_distance_value: null,
		total_distance_unit: null,
		total_distance_unit_text: null,
		total_time: '01:43:44',
		total_time_value: 6224,
		total_time_unit: 'sec'
	},
	training_condition: null,
	suggested_shoe: null
} satisfies ScheduledTrainingDetail;

// An interval session, from the response to a cool-down toggle. Two things here
// appear nowhere else: `can_toggle_cooldown` is true (with the cool-down already
// dropped), and the distance package counts repetitions instead of percentages.
const intervalDetail = {
	id: 127477832,
	day: 1787695200,
	day_long: '2026-08-26',
	title: 'Intervals',
	description: 'Only two reps, but that has everything to do with the intensity.',
	show_description_from: 1787090400,
	type: 'training',
	icon_url: 'https://backend-prod.trenara.com/icons/icon__step.svg',
	hex_training: '#CC3311',
	hex_completed: null,
	last_garmin_sync: '2026-08-22 10:54:12',
	can_be_edited: true,
	can_cross_train: false,
	cross_type: null,
	can_toggle_cooldown: true,
	has_cooldown: false,
	can_change_distance: true,
	change_distance_package: {
		title: 'Fine-tune intervals',
		text: 'You can adjust the number of repetitions here.',
		steps: [
			// Repetition counts, not percentage deltas — and with no 0 step there
			// is nothing here that means "as the coach planned it".
			{ step: 1, value: 1, text: '1x', selected: false },
			{ step: 2, value: 2, text: '2x', selected: true },
			{ step: 3, value: 3, text: '3x', selected: false }
		]
	},
	can_change_intensity: true,
	change_intensity_package: {
		title: 'Fine-tune intensity',
		text: 'You can always ease off; increases are capped.',
		steps: [
			{ step: 1, value: -4, text: 'Slower', selected: false },
			{ step: 2, value: -2, text: 'A bit slower', selected: false },
			{ step: 3, value: 0, text: 'As planned', selected: true },
			{ step: 4, value: 2, text: 'A bit faster', selected: false },
			{ step: 5, value: 4, text: 'Faster', selected: false }
		]
	},
	can_change_pacing_plan: false,
	change_pacing_plan_package: null,
	can_be_exchanged: true,
	team_data: {
		team_id: 470,
		name: 'Valencia 42k',
		picture: null,
		nr_same_day_participants: 0,
		nr_other_day_participants: 0,
		matches_captain_day: true,
		captain_pace: true,
		can_toggle_pace: false,
		can_show_participant_overview: true
	},
	training: {
		blocks: [
			{
				order: 1,
				type: 'warmup',
				prior: 'time',
				hex_graph: '#44A6D3',
				calc_time_in_sec: 900,
				hex_text: '#FFFFFF',
				time: '15:00',
				time_in_sec: 900,
				time_value: 900,
				time_unit: 'sec',
				distance: '2.69km',
				distance_value: 2.69,
				distance_unit: 'km',
				distance_unit_text: 'km',
				pace: '05:34 min/km',
				pace_value: 334,
				pace_unit: 'min/km',
				pace_per_hour: '10.78 km/h',
				pace_per_hour_value: 334,
				pace_per_hour_unit: 'km/h',
				prefer_pph: false,
				pace_range: '05:22-05:47 min/km',
				pace_range_value_min: 347,
				pace_range_value_max: 322,
				pace_per_hour_range: '10.37-11.18 km/h',
				pace_per_hour_range_value_min: 347,
				pace_per_hour_range_value_max: 322,
				text: 'Warm-up: 15:00 at 05:22-05:47 min/km (2.69km)',
				text_pph: 'Warm-up: 15:00 at 10.37-11.18 km/h (2.69km)'
			},
			{
				order: 2,
				repeat: 2,
				type: 'core',
				blocks: [
					{
						order: 1,
						type: 'run',
						prior: 'distance',
						hex_graph: '#7B3294',
						hex_text: '#FFFFFF',
						time: '05:39',
						time_in_sec: 339,
						time_value: 339,
						time_unit: 'sec',
						distance: '1.5km',
						distance_value: 1.5,
						distance_unit: 'km',
						distance_unit_text: 'km',
						pace: '03:46 min/km',
						pace_value: 226,
						pace_unit: 'min/km',
						pace_per_hour: '15.93 km/h',
						pace_per_hour_value: 226,
						pace_per_hour_unit: 'km/h',
						prefer_pph: false,
						text: 'Run 1.5km in 05:39 (03:46 min/km)',
						text_pph: 'Run 1.5km in 05:39 (15.93 km/h)'
					},
					{
						order: 2,
						type: 'rest',
						prior: 'time',
						hex_graph: '#D6EAF8',
						hex_text: '#FFFFFF',
						time: '04:00',
						time_in_sec: 240,
						time_value: 240,
						time_unit: 'sec',
						distance: '528m',
						distance_value: 528,
						distance_unit: 'm',
						distance_unit_text: 'm',
						pace: '07:34 min/km',
						pace_value: 454,
						pace_unit: 'min/km',
						pace_per_hour: '7.93 km/h',
						pace_per_hour_value: 454,
						pace_per_hour_unit: 'km/h',
						prefer_pph: false,
						pace_range: '06:56-08:12 min/km',
						pace_range_value_min: 492,
						pace_range_value_max: 416,
						pace_per_hour_range: '7.32-8.65 km/h',
						pace_per_hour_range_value_min: 492,
						pace_per_hour_range_value_max: 416,
						text: 'Rest 04:00 at 06:56-08:12 min/km (528m)',
						text_pph: 'Rest 04:00 at 7.32-8.65 km/h (528m)'
					}
				]
			}
		],
		total_time_in_sec: 2058,
		total_distance_in_km: 6.7518666666666665,
		core_time_in_sec: 678,
		pre_advice: null,
		post_advice: null,
		core_distance: '3km',
		core_distance_value: 3,
		core_distance_unit: 'km',
		core_distance_unit_text: 'km',
		core_time: '11:18',
		core_time_value: 678,
		core_time_unit: 'sec',
		total_distance: '6.75km',
		total_distance_value: 6.75,
		total_distance_unit: 'km',
		total_distance_unit_text: 'km',
		total_time: '34:18',
		total_time_value: 2058,
		total_time_unit: 'sec'
	},
	// Conditions unset while a shoe is assigned — the two are independent.
	training_condition: null,
	suggested_shoe: {
		id: 6404,
		brand: 'Adidas',
		name: 'Boston 13',
		type: 'supertrainer',
		preferred: false,
		buy_date: '2026-01-11',
		lifetime_percentage: 31.759999999999998,
		created_at: '2026-01-14T09:05:28+01:00',
		updated_at: '2026-01-14T09:05:28+01:00',
		retired_at: null,
		expected_lifetime_distance: '800km',
		expected_lifetime_distance_value: 800,
		expected_lifetime_distance_unit: 'km',
		expected_lifetime_distance_unit_text: 'km',
		distance_done: '254.08km',
		distance_done_value: 254.08,
		distance_done_unit: 'km',
		distance_done_unit_text: 'km',
		avg_pace: '05:06 min/km',
		avg_pace_value: 306,
		avg_pace_unit: 'min/km',
		picture: null
	}
} satisfies ScheduledTrainingDetail;

// A steady long run, from the responses to PUT .../distance and .../intensity.
// The session both endpoints were captured against, and the only detail where
// `training_condition` is null while a change package still reports an applied
// step.
const steadyRunDetail = {
	id: 127477834,
	day: 1787868000,
	day_long: '2026-08-28',
	title: 'LSD',
	description: 'Tip: No need to take LSD for this LSD.',
	show_description_from: 1787263200,
	type: 'training',
	icon_url: 'https://backend-prod.trenara.com/icons/icon__step.svg',
	hex_training: '#44A6D3',
	hex_completed: null,
	last_garmin_sync: '2026-08-21 16:31:26',
	can_be_edited: true,
	can_cross_train: true,
	cross_type: null,
	can_toggle_cooldown: false,
	has_cooldown: false,
	can_change_distance: true,
	change_distance_package: {
		title: 'Fine-tune distance',
		text: 'You can adjust today’s volume here.',
		steps: [
			{ step: 1, value: -10, text: '-10%', selected: false },
			{ step: 2, value: -5, text: '-5%', selected: true },
			{ step: 3, value: 0, text: '0%', selected: false },
			{ step: 4, value: 5, text: '5%', selected: false },
			{ step: 5, value: 10, text: '10%', selected: false }
		]
	},
	can_change_intensity: true,
	change_intensity_package: {
		title: 'Fine-tune intensity',
		text: 'You can always ease off; increases are capped.',
		steps: [
			{ step: 1, value: -4, text: 'Slower', selected: false },
			{ step: 2, value: -2, text: 'A bit slower', selected: false },
			{ step: 3, value: 0, text: 'As planned', selected: true },
			{ step: 4, value: 2, text: 'A bit faster', selected: false },
			{ step: 5, value: 4, text: 'Faster', selected: false }
		]
	},
	can_change_pacing_plan: false,
	change_pacing_plan_package: null,
	can_be_exchanged: true,
	team_data: {
		team_id: 470,
		name: 'Valencia 42k',
		picture: null,
		nr_same_day_participants: 0,
		nr_other_day_participants: 0,
		matches_captain_day: true,
		captain_pace: true,
		can_toggle_pace: false,
		can_show_participant_overview: true
	},
	training: {
		blocks: [
			{
				order: 1,
				repeat: 1,
				type: 'core',
				blocks: [
					{
						order: 1,
						type: 'run',
						prior: 'distance',
						hex_graph: '#44A6D3',
						hex_text: '#FFFFFF',
						time: '01:03:15',
						time_in_sec: 3795,
						time_value: 3795,
						time_unit: 'sec',
						distance: '11.4km',
						distance_value: 11.4,
						distance_unit: 'km',
						distance_unit_text: 'km',
						pace: '05:33 min/km',
						pace_value: 333,
						pace_unit: 'min/km',
						pace_per_hour: '10.81 km/h',
						pace_per_hour_value: 333,
						pace_per_hour_unit: 'km/h',
						prefer_pph: false,
						pace_range: '05:21-05:46 min/km',
						pace_range_value_min: 346,
						pace_range_value_max: 321,
						pace_per_hour_range: '10.40-11.22 km/h',
						pace_per_hour_range_value_min: 346,
						pace_per_hour_range_value_max: 321,
						text: 'Run 11.4km in 01:03:15 (05:21-05:46 min/km)',
						text_pph: 'Run 11.4km in 01:03:15 (10.40-11.22 km/h)'
					}
				]
			}
		],
		total_time_in_sec: 3795,
		total_distance_in_km: 11.399,
		core_time_in_sec: 3795,
		pre_advice: null,
		post_advice: null,
		core_distance: '11.4km',
		core_distance_value: 11.4,
		core_distance_unit: 'km',
		core_distance_unit_text: 'km',
		core_time: '01:03:15',
		core_time_value: 3795,
		core_time_unit: 'sec',
		total_distance: '11.4km',
		total_distance_value: 11.4,
		total_distance_unit: 'km',
		total_distance_unit_text: 'km',
		total_time: '01:03:15',
		total_time_value: 3795,
		total_time_unit: 'sec'
	},
	// Null even though a distance step is applied and an intensity step is
	// selected. The applied settings live in the packages, not in here.
	training_condition: null,
	suggested_shoe: {
		id: 4141,
		brand: 'Nike',
		name: 'Invincible Run 3',
		type: 'long_run',
		preferred: false,
		buy_date: '2025-10-19',
		lifetime_percentage: 44.37500000000001,
		created_at: '2025-10-20T13:22:07+02:00',
		updated_at: '2025-10-20T13:22:07+02:00',
		retired_at: null,
		expected_lifetime_distance: '800km',
		expected_lifetime_distance_value: 800,
		expected_lifetime_distance_unit: 'km',
		expected_lifetime_distance_unit_text: 'km',
		distance_done: '355km',
		distance_done_value: 355,
		distance_done_unit: 'km',
		distance_done_unit_text: 'km',
		avg_pace: '05:15 min/km',
		avg_pace_value: 315,
		avg_pace_unit: 'min/km',
		picture: null
	}
} satisfies ScheduledTrainingDetail;

// The goal race: the one session in the whole plan where the pacing plan is
// offered. Nothing else can be changed and it cannot be deleted.
const raceDetail = {
	id: 127477847,
	day: 1790460000,
	day_long: '2026-09-27',
	title: '15k nocturno',
	description:
		'Time for your 15k nocturno. You’ve trained hard for this, Nils.\n\n' +
		'And those who train well are usually rewarded for it. Best of luck! I’m already cheering ' +
		'you on.\n\nFeel free to share your result on social media so we can celebrate with you!',
	show_description_from: 1789855200,
	type: 'goal',
	icon_url: 'https://backend-prod.trenara.com/icons/icon__badge.svg',
	hex_training: '#7B3294',
	hex_completed: null,
	last_garmin_sync: null,
	can_be_edited: false,
	can_cross_train: false,
	cross_type: null,
	can_toggle_cooldown: false,
	has_cooldown: false,
	can_change_distance: false,
	change_distance_package: null,
	can_change_intensity: true,
	change_intensity_package: {
		title: 'Fine-tune intensity',
		text:
			'Change today’s session intensity within limits set by Coach Christophe. You can always ' +
			'ease off; increases are capped.',
		steps: [
			{ step: 1, value: -4, text: 'Slower', selected: false },
			{ step: 2, value: -2, text: 'A bit slower', selected: false },
			{ step: 3, value: 0, text: 'As planned', selected: true },
			{ step: 4, value: 2, text: 'A bit faster', selected: false }
		]
	},
	can_change_pacing_plan: true,
	change_pacing_plan_package: [
		{
			order: 1,
			value: 'trenara',
			title: 'Pacing plan',
			description: 'All roads lead to Rome, but this is my preferred pacing plan for your race.',
			selected: false
		},
		{
			order: 2,
			value: 'alternative',
			title: 'Plan B',
			description:
				"Always have a plan B in place. Sometimes plan A doesn't match how you feel or the " +
				"race-day circumstances. Here's an alternative pacing plan.",
			selected: false
		},
		{
			order: 3,
			value: null,
			title: 'No pacing plan',
			description: 'One block at your selected pace.',
			selected: true
		}
	],
	can_be_exchanged: false,
	team_data: {
		team_id: 470,
		name: 'Valencia 42k',
		picture: null,
		nr_same_day_participants: 0,
		nr_other_day_participants: 0,
		matches_captain_day: true,
		captain_pace: true,
		can_toggle_pace: false,
		can_show_participant_overview: true
	},
	training: {
		blocks: [
			{
				order: 1,
				repeat: 1,
				type: 'core',
				blocks: [
					{
						order: 1,
						type: 'run',
						prior: 'distance',
						hex_graph: '#CC3311',
						hex_text: '#FFFFFF',
						time: '56:00',
						time_in_sec: 3360,
						time_value: 3360,
						time_unit: 'sec',
						distance: '15km',
						distance_value: 15,
						distance_unit: 'km',
						distance_unit_text: 'km',
						pace: '03:44 min/km',
						pace_value: 224,
						pace_unit: 'min/km',
						pace_per_hour: '16.07 km/h',
						pace_per_hour_value: 224,
						pace_per_hour_unit: 'km/h',
						prefer_pph: false,
						text: 'Run 15km in 56:00 (03:44 min/km)',
						text_pph: 'Run 15km in 56:00 (16.07 km/h)'
					}
				]
			}
		],
		total_time_in_sec: 3360,
		total_distance_in_km: 15,
		core_time_in_sec: 3360,
		pre_advice: null,
		post_advice: null,
		core_distance: '15km',
		core_distance_value: 15,
		core_distance_unit: 'km',
		core_distance_unit_text: 'km',
		core_time: '56:00',
		core_time_value: 3360,
		core_time_unit: 'sec',
		total_distance: '15km',
		total_distance_value: 15,
		total_distance_unit: 'km',
		total_distance_unit_text: 'km',
		total_time: '56:00',
		total_time_value: 3360,
		total_time_unit: 'sec'
	},
	training_condition: {
		id: 3788086,
		type: 'Goal',
		height_difference: 'flat',
		surface: 'road',
		intensity: 100,
		updated_at: 1782684230,
		height: null,
		height_value: null,
		height_unit: null,
		height_unit_text: null
	},
	suggested_shoe: {
		id: 2447,
		brand: 'ASICS',
		name: 'Metaspeed Edge',
		type: 'supershoe',
		preferred: false,
		buy_date: '2024-10-05',
		lifetime_percentage: 38.64153846153846,
		created_at: '2025-09-10T16:25:14+02:00',
		updated_at: '2025-09-10T16:25:14+02:00',
		retired_at: null,
		expected_lifetime_distance: '650km',
		expected_lifetime_distance_value: 650,
		expected_lifetime_distance_unit: 'km',
		expected_lifetime_distance_unit_text: 'km',
		distance_done: '251.17km',
		distance_done_value: 251.17,
		distance_done_unit: 'km',
		distance_done_unit_text: 'km',
		avg_pace: '05:06 min/km',
		avg_pace_value: 306,
		avg_pace_unit: 'min/km',
		picture: null
	}
} satisfies ScheduledTrainingDetail;

// ─────────────────────────────────────────────────────────────
// The week response.
//
// Keys only, first read off `GET /api/schedule/week/` on 2026-08-23 on a
// running session in a live account. The key set is the fact worth keeping,
// because it decides how much of the session-setup UI can be built without a
// second request per day.
//
// The 2026-10-07 capture added the nine fields of the coach's distance
// adjustment (`has_intelligence` … `base_distance`), which had until then been
// seen only on a detail. The list is that capture's, and a test below pins it
// to `weekWithAdjustment` so the two cannot drift apart.
// ─────────────────────────────────────────────────────────────
const WEEK_TRAINING_KEYS = [
	'base_distance',
	'can_be_edited',
	'can_be_exchanged',
	'can_change_distance',
	'can_change_intensity',
	'can_change_pacing_plan',
	'can_cross_train',
	'can_toggle_cooldown',
	'change_distance_package',
	'change_intensity_package',
	'change_pacing_plan_package',
	'cross_type',
	'day',
	'day_long',
	'description',
	'distance_limit',
	'has_cooldown',
	'has_intelligence',
	'hex_completed',
	'hex_training',
	'icon_url',
	'id',
	'intelligence_distance',
	'intelligence_distance_unit',
	'intelligence_distance_unit_text',
	'intelligence_distance_value',
	'intelligence_text',
	'last_garmin_sync',
	'original_distance_km',
	'show_description_from',
	'team_data',
	'title',
	'training',
	'type'
] as const;

// An exchange candidate: no conditions, team or shoe, and a distance package.
const exchangeCandidate = {
	id: 20112,
	day: 1787349600,
	day_long: '2026-08-22',
	title: 'Easy run + strides',
	description: 'A standard endurance run.',
	show_description_from: 1786744800,
	type: 'training',
	icon_url: 'https://backend-prod.trenara.com/icons/icon__step.svg',
	hex_training: '#7B3294',
	hex_completed: null,
	last_garmin_sync: null,
	can_be_edited: true,
	can_cross_train: true,
	cross_type: null,
	can_toggle_cooldown: false,
	has_cooldown: false,
	can_change_distance: true,
	change_distance_package: {
		title: 'Fine-tune distance',
		text: 'When you have limited time, time to spare, heavy legs, or...',
		steps: [
			{ step: 1, value: -30, text: '-30%', selected: false },
			{ step: 4, value: 0, text: '0%', selected: true }
		]
	},
	can_change_intensity: true,
	change_intensity_package: {
		title: 'Fine-tune intensity',
		text: 'Change today’s session intensity within limits set by Coach Christophe.',
		// Five steps here where other packages have four — never index by position.
		steps: [
			{ step: 1, value: -4, text: 'Slower', selected: false },
			{ step: 2, value: -2, text: 'A bit slower', selected: false },
			{ step: 3, value: 0, text: 'As planned', selected: true },
			{ step: 4, value: 2, text: 'A bit faster', selected: false },
			{ step: 5, value: 4, text: 'Faster', selected: false }
		]
	},
	can_change_pacing_plan: false,
	change_pacing_plan_package: null,
	can_be_exchanged: true,
	training: {
		blocks: [
			{
				order: 2,
				repeat: 4,
				type: 'core',
				blocks: [
					{
						order: 1,
						type: 'run',
						prior: 'distance',
						hex_graph: '#7B3294',
						hex_text: '#FFFFFF',
						time: '00:15',
						time_in_sec: 15,
						time_value: 15,
						time_unit: 'sec',
						// Metres, not kilometres.
						distance: '80m',
						distance_value: 80,
						distance_unit: 'm',
						distance_unit_text: 'm',
						pace: '03:10 min/km',
						pace_value: 190,
						pace_unit: 'min/km',
						pace_per_hour: '18.95 km/h',
						pace_per_hour_value: 190,
						pace_per_hour_unit: 'km/h',
						prefer_pph: false,
						// No pace_range fields at all on this one.
						text: 'Run 80m in 00:15 (03:10 min/km)',
						text_pph: 'Run 80m in 00:15 (18.95 km/h)'
					},
					{
						order: 2,
						type: 'rest',
						prior: 'time',
						hex_graph: '#90CFF1',
						hex_text: '#FFFFFF',
						time: '03:00',
						time_in_sec: 180,
						time_value: 180,
						time_unit: 'sec',
						distance: '443m',
						distance_value: 443,
						distance_unit: 'm',
						distance_unit_text: 'm',
						pace: '06:46 min/km',
						pace_value: 406,
						pace_unit: 'min/km',
						pace_per_hour: '8.87 km/h',
						pace_per_hour_value: 406,
						pace_per_hour_unit: 'km/h',
						prefer_pph: false,
						pace_range: '06:31-07:01 min/km',
						pace_range_value_min: 421,
						pace_range_value_max: 391,
						pace_per_hour_range: '8.55-9.21 km/h',
						pace_per_hour_range_value_min: 421,
						pace_per_hour_range_value_max: 391,
						text: 'Rest 03:00 at 06:31-07:01 min/km (443m)',
						text_pph: 'Rest 03:00 at 8.55-9.21 km/h (443m)'
					}
				]
			}
		],
		total_time_in_sec: 3929,
		total_distance_in_km: 12.0934,
		core_time_in_sec: 60,
		pre_advice: null,
		post_advice: null,
		core_distance: '320m',
		core_distance_value: 320,
		core_distance_unit: 'm',
		core_distance_unit_text: 'm',
		core_time: '01:00',
		core_time_value: 60,
		core_time_unit: 'sec',
		total_distance: '12.09km',
		total_distance_value: 12.09,
		total_distance_unit: 'km',
		total_distance_unit_text: 'km',
		total_time: '01:05:29',
		total_time_value: 3929,
		total_time_unit: 'sec'
	}
} satisfies ExchangeCandidate;

// ─────────────────────────────────────────────────────────────
// The week, and adding and removing a session — all captured on
// 2026-10-07 against week 39515460 (and the week after it).
// ─────────────────────────────────────────────────────────────

// `GET /api/schedule/week/?timestamp=1791806400`. Trimmed to the first of its
// four trainings, which is the one the coach had adjusted itself — the first
// capture of `has_intelligence: true`: an easy run planned at 10km, raised to
// 11km from the runner's recent load. Everything else is verbatim.
const weekWithAdjustment = {
	id: 39515461,
	start_day: 1791756000,
	start_day_long: '2026-10-12',
	can_receive_new_trainings: true,
	training_week: 5,
	type: 'ultimate',
	trainings: [
		{
			id: 132517544,
			day: 1791842400,
			day_long: '2026-10-13',
			title: 'Easy run + strides',
			description: 'Making kilometers at a comfortable pace, go get them tiger!',
			show_description_from: 1791237600,
			type: 'training',
			icon_url: 'https://backend-prod.trenara.com/icons/icon__step.svg',
			hex_training: '#7B3294',
			hex_completed: null,
			last_garmin_sync: '2026-10-07 01:17:32',
			can_be_edited: true,
			can_cross_train: true,
			cross_type: null,
			can_toggle_cooldown: false,
			has_cooldown: false,
			can_change_distance: false,
			change_distance_package: null,
			can_change_intensity: true,
			change_intensity_package: {
				title: 'Fine-tune intensity',
				text: 'Change today’s session intensity within limits set by Coach Christophe. You can always ease off; increases are capped.',
				steps: [
					{
						step: 1,
						value: -4,
						text: 'Slower',
						selected: false
					},
					{
						step: 2,
						value: -2,
						text: 'A bit slower',
						selected: false
					},
					{
						step: 3,
						value: 0,
						text: 'As planned',
						selected: true
					},
					{
						step: 4,
						value: 2,
						text: 'A bit faster',
						selected: false
					}
				]
			},
			can_change_pacing_plan: false,
			change_pacing_plan_package: null,
			can_be_exchanged: true,
			has_intelligence: true,
			intelligence_text:
				'I’ve adjusted your training, Nils. Based on your recent (mechanical) running load, there seems to be room to safely extend the original distance of 10km for this workout. The new distance of 11km is therefore a little longer, while remaining within our safe limits.\n\nNot feeling quite as good today? You can still shorten the workout a little.\n',
			distance_limit: 0,
			original_distance_km: 10,
			base_distance: 11000,
			intelligence_distance: '-1000m',
			intelligence_distance_value: -1000,
			intelligence_distance_unit: 'm',
			intelligence_distance_unit_text: 'm',
			team_data: {
				team_id: 470,
				name: 'Valencia 42k',
				picture: null,
				nr_same_day_participants: 0,
				nr_other_day_participants: 0,
				matches_captain_day: true,
				captain_pace: true,
				can_toggle_pace: false,
				can_show_participant_overview: true
			},
			training: {
				blocks: [
					{
						order: 1,
						type: 'warmup',
						prior: 'distance',
						hex_graph: '#009E73',
						calc_time_in_sec: 3211,
						hex_text: '#FFFFFF',
						time: '53:31',
						time_in_sec: 3211,
						time_value: 3211,
						time_unit: 'sec',
						distance: '11km',
						distance_value: 11,
						distance_unit: 'km',
						distance_unit_text: 'km',
						pace: '04:52 min/km',
						pace_value: 292,
						pace_unit: 'min/km',
						pace_per_hour: '12.33 km/h',
						pace_per_hour_value: 292,
						pace_per_hour_unit: 'km/h',
						prefer_pph: false,
						pace_range: '04:42-05:03 min/km',
						pace_range_value_min: 303,
						pace_range_value_max: 282,
						pace_per_hour_range: '11.88-12.77 km/h',
						pace_per_hour_range_value_min: 303,
						pace_per_hour_range_value_max: 282,
						text: 'Warm-up: 11km in 53:31 (04:42-05:03 min/km)',
						text_pph: 'Warm-up: 11km in 53:31 (11.88-12.77 km/h)'
					},
					{
						order: 2,
						repeat: 4,
						type: 'core',
						blocks: [
							{
								order: 1,
								type: 'run',
								prior: 'distance',
								hex_graph: '#7B3294',
								hex_text: '#FFFFFF',
								time: '00:14',
								time_in_sec: 14,
								time_value: 14,
								time_unit: 'sec',
								distance: '80m',
								distance_value: 80,
								distance_unit: 'm',
								distance_unit_text: 'm',
								pace: '02:56 min/km',
								pace_value: 176,
								pace_unit: 'min/km',
								pace_per_hour: '20.45 km/h',
								pace_per_hour_value: 176,
								pace_per_hour_unit: 'km/h',
								prefer_pph: false,
								text: 'Run 80m in 00:14 (02:56 min/km)',
								text_pph: 'Run 80m in 00:14 (20.45 km/h)'
							},
							{
								order: 2,
								type: 'rest',
								prior: 'time',
								hex_graph: '#D6EAF8',
								hex_text: '#FFFFFF',
								time: '03:00',
								time_in_sec: 180,
								time_value: 180,
								time_unit: 'sec',
								distance: '422m',
								distance_value: 422,
								distance_unit: 'm',
								distance_unit_text: 'm',
								pace: '07:06 min/km',
								pace_value: 426,
								pace_unit: 'min/km',
								pace_per_hour: '8.45 km/h',
								pace_per_hour_value: 426,
								pace_per_hour_unit: 'km/h',
								prefer_pph: false,
								pace_range: '06:31-07:42 min/km',
								pace_range_value_min: 462,
								pace_range_value_max: 391,
								pace_per_hour_range: '7.79-9.21 km/h',
								pace_per_hour_range_value_min: 462,
								pace_per_hour_range_value_max: 391,
								text: 'Rest 03:00 at 06:31-07:42 min/km (422m)',
								text_pph: 'Rest 03:00 at 7.79-9.21 km/h (422m)'
							}
						]
					}
				],
				total_time_in_sec: 3987,
				total_distance_in_km: 13.01014,
				core_time_in_sec: 56,
				pre_advice: null,
				post_advice: null,
				core_distance: '320m',
				core_distance_value: 320,
				core_distance_unit: 'm',
				core_distance_unit_text: 'm',
				core_time: '00:56',
				core_time_value: 56,
				core_time_unit: 'sec',
				total_distance: '13.01km',
				total_distance_value: 13.01,
				total_distance_unit: 'km',
				total_distance_unit_text: 'km',
				total_time: '01:06:27',
				total_time_value: 3987,
				total_time_unit: 'sec'
			}
		}
	],
	strength_trainings: [],
	entries: []
} satisfies Schedule;

// `GET /api/schedule/39515460/new_trainings?date=2026-10-10`: the first of the
// three candidates offered (the other two, an endurance run of 10km and one of
// 5km, have the same keys).
const newTrainingCandidate = {
	id: 24180,
	day: 1791583200,
	day_long: '2026-10-10',
	title: 'Recovery run',
	description: 'A second recovery run this week, because... why not?',
	show_description_from: 1790978400,
	type: 'training',
	icon_url: 'https://backend-prod.trenara.com/icons/icon__step.svg',
	hex_training: '#90CFF1',
	hex_completed: null,
	last_garmin_sync: null,
	can_be_edited: true,
	can_cross_train: true,
	cross_type: null,
	can_toggle_cooldown: true,
	has_cooldown: false,
	can_change_distance: true,
	change_distance_package: {
		title: 'Fine-tune distance',
		text: "Short on time, dealing with heavy legs, or ready to go a little farther? Adjust today's volume here.\n\nCoach Christophe's options preserve the intended training stimulus while adapting the session to your day.",
		steps: [
			{
				step: 1,
				value: -30,
				text: '-30%',
				selected: false
			},
			{
				step: 2,
				value: -20,
				text: '-20%',
				selected: false
			},
			{
				step: 3,
				value: -10,
				text: '-10%',
				selected: false
			},
			{
				step: 4,
				value: 0,
				text: '0%',
				selected: true
			}
		]
	},
	can_change_intensity: true,
	change_intensity_package: {
		title: 'Fine-tune intensity',
		text: 'Change today’s session intensity within limits set by Coach Christophe. You can always ease off; increases are capped.',
		steps: [
			{
				step: 1,
				value: -4,
				text: 'Slower',
				selected: false
			},
			{
				step: 2,
				value: -2,
				text: 'A bit slower',
				selected: false
			},
			{
				step: 3,
				value: 0,
				text: 'As planned',
				selected: true
			},
			{
				step: 4,
				value: 2,
				text: 'A bit faster',
				selected: false
			}
		]
	},
	can_change_pacing_plan: false,
	change_pacing_plan_package: null,
	can_be_exchanged: true,
	has_intelligence: false,
	intelligence_text: null,
	distance_limit: false,
	original_distance_km: 8,
	base_distance: null,
	intelligence_distance: null,
	intelligence_distance_value: null,
	intelligence_distance_unit: null,
	intelligence_distance_unit_text: null,
	training: {
		blocks: [
			{
				order: 1,
				repeat: 1,
				type: 'core',
				blocks: [
					{
						order: 1,
						type: 'run',
						prior: 'distance',
						hex_graph: '#90CFF1',
						hex_text: '#FFFFFF',
						time: '47:27',
						time_in_sec: 2847,
						time_value: 2847,
						time_unit: 'sec',
						distance: '8km',
						distance_value: 8,
						distance_unit: 'km',
						distance_unit_text: 'km',
						pace: '05:56 min/km',
						pace_value: 356,
						pace_unit: 'min/km',
						pace_per_hour: '10.11 km/h',
						pace_per_hour_value: 356,
						pace_per_hour_unit: 'km/h',
						prefer_pph: false,
						pace_range: '05:27-06:26 min/km',
						pace_range_value_min: 386,
						pace_range_value_max: 327,
						pace_per_hour_range: '9.33-11.01 km/h',
						pace_per_hour_range_value_min: 386,
						pace_per_hour_range_value_max: 327,
						text: 'Run 8km in 47:27 (05:27-06:26 min/km)',
						text_pph: 'Run 8km in 47:27 (9.33-11.01 km/h)'
					}
				]
			}
		],
		total_time_in_sec: 2847,
		total_distance_in_km: 8,
		core_time_in_sec: 2847,
		pre_advice: null,
		post_advice: null,
		core_distance: '8km',
		core_distance_value: 8,
		core_distance_unit: 'km',
		core_distance_unit_text: 'km',
		core_time: '47:27',
		core_time_value: 2847,
		core_time_unit: 'sec',
		total_distance: '8km',
		total_distance_value: 8,
		total_distance_unit: 'km',
		total_distance_unit_text: 'km',
		total_time: '47:27',
		total_time_value: 2847,
		total_time_unit: 'sec'
	}
} satisfies NewTrainingCandidate;

// `POST /api/schedule/39515460/new_trainings` with this body: that candidate,
// added on the 10th.
const addNewTrainingBody = {
	date: '2026-10-10',
	training_id: 24180
} satisfies AddNewTrainingRequest;

const addedTraining = {
	id: 133797044,
	day: 1791583200,
	day_long: '2026-10-09T22:00:00.000000Z',
	title: 'Recovery run',
	description: 'A second recovery run this week, because... why not?',
	show_description_from: 1790978400,
	type: 'training',
	icon_url: 'https://backend-prod.trenara.com/icons/icon__step.svg',
	hex_training: '#90CFF1',
	hex_completed: null,
	last_garmin_sync: null,
	can_be_edited: true,
	can_cross_train: true,
	cross_type: null,
	can_toggle_cooldown: true,
	has_cooldown: false,
	can_change_distance: true,
	change_distance_package: {
		title: 'Fine-tune distance',
		text: "Short on time, dealing with heavy legs, or ready to go a little farther? Adjust today's volume here.\n\nCoach Christophe's options preserve the intended training stimulus while adapting the session to your day.",
		steps: [
			{
				step: 1,
				value: -30,
				text: '-30%',
				selected: false
			},
			{
				step: 2,
				value: -20,
				text: '-20%',
				selected: false
			},
			{
				step: 3,
				value: -10,
				text: '-10%',
				selected: false
			},
			{
				step: 4,
				value: 0,
				text: '0%',
				selected: true
			}
		]
	},
	can_change_intensity: true,
	change_intensity_package: {
		title: 'Fine-tune intensity',
		text: 'Change today’s session intensity within limits set by Coach Christophe. You can always ease off; increases are capped.',
		steps: [
			{
				step: 1,
				value: -4,
				text: 'Slower',
				selected: false
			},
			{
				step: 2,
				value: -2,
				text: 'A bit slower',
				selected: false
			},
			{
				step: 3,
				value: 0,
				text: 'As planned',
				selected: true
			},
			{
				step: 4,
				value: 2,
				text: 'A bit faster',
				selected: false
			}
		]
	},
	can_change_pacing_plan: false,
	change_pacing_plan_package: null,
	can_be_exchanged: true,
	has_intelligence: false,
	intelligence_text: null,
	distance_limit: false,
	original_distance_km: 8,
	base_distance: null,
	intelligence_distance: null,
	intelligence_distance_value: null,
	intelligence_distance_unit: null,
	intelligence_distance_unit_text: null,
	team_data: {
		team_id: 470,
		name: 'Valencia 42k',
		picture: null,
		nr_same_day_participants: 0,
		nr_other_day_participants: 0,
		matches_captain_day: true,
		captain_pace: true,
		can_toggle_pace: false,
		can_show_participant_overview: true
	},
	training: {
		blocks: [
			{
				order: 1,
				repeat: 1,
				type: 'core',
				blocks: [
					{
						order: 1,
						type: 'run',
						prior: 'distance',
						hex_graph: '#90CFF1',
						hex_text: '#FFFFFF',
						time: '47:27',
						time_in_sec: 2847,
						time_value: 2847,
						time_unit: 'sec',
						distance: '8km',
						distance_value: 8,
						distance_unit: 'km',
						distance_unit_text: 'km',
						pace: '05:56 min/km',
						pace_value: 356,
						pace_unit: 'min/km',
						pace_per_hour: '10.11 km/h',
						pace_per_hour_value: 356,
						pace_per_hour_unit: 'km/h',
						prefer_pph: false,
						pace_range: '05:27-06:26 min/km',
						pace_range_value_min: 386,
						pace_range_value_max: 327,
						pace_per_hour_range: '9.33-11.01 km/h',
						pace_per_hour_range_value_min: 386,
						pace_per_hour_range_value_max: 327,
						text: 'Run 8km in 47:27 (05:27-06:26 min/km)',
						text_pph: 'Run 8km in 47:27 (9.33-11.01 km/h)'
					}
				]
			}
		],
		total_time_in_sec: 2847,
		total_distance_in_km: 8,
		core_time_in_sec: 2847,
		pre_advice: null,
		post_advice: null,
		core_distance: '8km',
		core_distance_value: 8,
		core_distance_unit: 'km',
		core_distance_unit_text: 'km',
		core_time: '47:27',
		core_time_value: 2847,
		core_time_unit: 'sec',
		total_distance: '8km',
		total_distance_value: 8,
		total_distance_unit: 'km',
		total_distance_unit_text: 'km',
		total_time: '47:27',
		total_time_value: 2847,
		total_time_unit: 'sec'
	},
	training_condition: null,
	suggested_shoe: null
} satisfies ScheduledTrainingDetail;

// Removing it again: `PUT /api/schedule/trainings/133797044/change_test`, then
// `.../change_save`, both with this body.
const removeBody = { action: 'destroy', include_future: true } satisfies ScheduleChangeRequest;

const removeTest = {
	goal: {
		id: 2265606,
		name: 'Valencia 42k',
		distance_in_m: 42195,
		time_in_sec: 9768,
		goal_vo2max: 67.1551,
		goal_time_per_km: 231.4967,
		best_time_per_km: 228.9804,
		difficulty: 0,
		weekly_trainings: 4,
		last_prediction: 1791368449,
		start_date: 1791151200,
		end_date: 1796511600,
		end_date_text: '2026-12-06',
		goal_reached: null,
		prediction: true,
		my_time: false,
		can_be_edited: true,
		edit_warning:
			'Changing this goal will update it for everyone in the group. Do you want to continue?',
		created_at: 1789670863,
		training_scheme: {
			id: 419,
			number_of_trainings: 7,
			min_number_of_trainings: 3,
			max_number_of_trainings: 7,
			type: 'ultimate',
			weeks: 12,
			distance: '50km',
			distance_value: 50,
			distance_unit: 'km',
			distance_unit_text: 'km'
		},
		intermediate_goals: []
	},
	goal_possible: true,
	new_goal_time: 9855
} satisfies TestScheduleResponse;

// The save's answer, trimmed to the first of the four trainings left in the
// week. The key set at the top level is verbatim, absences included.
const removeSave = {
	id: 39515460,
	start_day: 1791151200,
	start_day_long: '2026-10-05',
	can_receive_new_trainings: true,
	training_week: 4,
	type: 'ultimate',
	trainings: [
		{
			id: 132517541,
			day: 1791324000,
			day_long: '2026-10-07',
			title: 'Intervals',
			description:
				"🇳🇴\n\nNorway's top athletics and triathlon athletes do this session as their second workout of the day. Yep, 400 m reps like these are typical of the famous double-threshold days.\n\nFor amateurs like us, a single-threshold session is more than enough. I think it fits nicely here in this recovery week: plenty of quality, limited load.\n\nWhen your threshold is set correctly, we never go into the red. To be fair, the 30-second recoveries still make this a demanding session. A good training stimulus is not automatically hard or easy.\n\nEnjoy it, Nils!",
			show_description_from: 1790719200,
			type: 'training',
			icon_url: 'https://backend-prod.trenara.com/icons/icon__step.svg',
			hex_training: '#CC3311',
			hex_completed: null,
			last_garmin_sync: '2026-10-07 01:17:30',
			can_be_edited: true,
			can_cross_train: false,
			cross_type: null,
			can_toggle_cooldown: true,
			has_cooldown: true,
			can_change_distance: true,
			change_distance_package: {
				title: 'Fine-tune intervals',
				text: 'Feeling less fresh—or exceptionally well recovered? Adjust the number of repetitions here.\n\nThe intensity and duration of each rep stay the same. Coach Christophe sets the limits to preserve the intended stimulus.',
				steps: [
					{
						step: 1,
						value: 15,
						text: '15x',
						selected: false
					},
					{
						step: 2,
						value: 16,
						text: '16x',
						selected: false
					},
					{
						step: 3,
						value: 17,
						text: '17x',
						selected: false
					},
					{
						step: 4,
						value: 18,
						text: '18x',
						selected: true
					},
					{
						step: 5,
						value: 19,
						text: '19x',
						selected: false
					},
					{
						step: 6,
						value: 20,
						text: '20x',
						selected: false
					}
				]
			},
			can_change_intensity: true,
			change_intensity_package: {
				title: 'Fine-tune intensity',
				text: 'Change today’s session intensity within limits set by Coach Christophe. You can always ease off; increases are capped.',
				steps: [
					{
						step: 1,
						value: -4,
						text: 'Slower',
						selected: false
					},
					{
						step: 2,
						value: -2,
						text: 'A bit slower',
						selected: false
					},
					{
						step: 3,
						value: 0,
						text: 'As planned',
						selected: true
					},
					{
						step: 4,
						value: 2,
						text: 'A bit faster',
						selected: false
					},
					{
						step: 5,
						value: 4,
						text: 'Faster',
						selected: false
					}
				]
			},
			can_change_pacing_plan: false,
			change_pacing_plan_package: null,
			can_be_exchanged: true,
			has_intelligence: false,
			intelligence_text: null,
			distance_limit: 0,
			original_distance_km: 129,
			base_distance: null,
			intelligence_distance: null,
			intelligence_distance_value: null,
			intelligence_distance_unit: null,
			intelligence_distance_unit_text: null,
			team_data: {
				team_id: 470,
				name: 'Valencia 42k',
				picture: null,
				nr_same_day_participants: 0,
				nr_other_day_participants: 0,
				matches_captain_day: true,
				captain_pace: true,
				can_toggle_pace: false,
				can_show_participant_overview: true
			},
			training: {
				blocks: [
					{
						order: 1,
						type: 'warmup',
						prior: 'time',
						hex_graph: '#44A6D3',
						calc_time_in_sec: 900,
						hex_text: '#FFFFFF',
						time: '15:00',
						time_in_sec: 900,
						time_value: 900,
						time_unit: 'sec',
						distance: '2.85km',
						distance_value: 2.85,
						distance_unit: 'km',
						distance_unit_text: 'km',
						pace: '05:16 min/km',
						pace_value: 316,
						pace_unit: 'min/km',
						pace_per_hour: '11.39 km/h',
						pace_per_hour_value: 316,
						pace_per_hour_unit: 'km/h',
						prefer_pph: false,
						pace_range: '05:05-05:28 min/km',
						pace_range_value_min: 328,
						pace_range_value_max: 305,
						pace_per_hour_range: '10.98-11.80 km/h',
						pace_per_hour_range_value_min: 328,
						pace_per_hour_range_value_max: 305,
						text: 'Warm-up: 15:00 at 05:05-05:28 min/km (2.85km)',
						text_pph: 'Warm-up: 15:00 at 10.98-11.80 km/h (2.85km)'
					},
					{
						order: 2,
						repeat: 18,
						type: 'core',
						blocks: [
							{
								order: 1,
								type: 'run',
								prior: 'distance',
								hex_graph: '#CC3311',
								hex_text: '#FFFFFF',
								time: '01:37',
								time_in_sec: 97,
								time_value: 97,
								time_unit: 'sec',
								distance: '400m',
								distance_value: 400,
								distance_unit: 'm',
								distance_unit_text: 'm',
								pace: '04:04 min/km',
								pace_value: 244,
								pace_unit: 'min/km',
								pace_per_hour: '14.75 km/h',
								pace_per_hour_value: 244,
								pace_per_hour_unit: 'km/h',
								prefer_pph: false,
								text: 'Run 400m in 01:37 (04:04 min/km)',
								text_pph: 'Run 400m in 01:37 (14.75 km/h)'
							},
							{
								order: 2,
								type: 'rest',
								prior: 'time',
								hex_graph: '#D6EAF8',
								hex_text: '#FFFFFF',
								time: '00:30',
								time_in_sec: 30,
								time_value: 30,
								time_unit: 'sec',
								distance: '69m',
								distance_value: 69,
								distance_unit: 'm',
								distance_unit_text: 'm',
								pace: '07:09 min/km',
								pace_value: 429,
								pace_unit: 'min/km',
								pace_per_hour: '8.39 km/h',
								pace_per_hour_value: 429,
								pace_per_hour_unit: 'km/h',
								prefer_pph: false,
								pace_range: '06:33-07:45 min/km',
								pace_range_value_min: 465,
								pace_range_value_max: 393,
								pace_per_hour_range: '7.74-9.16 km/h',
								pace_per_hour_range_value_min: 465,
								pace_per_hour_range_value_max: 393,
								text: 'Rest 00:30 at 06:33-07:45 min/km (69m)',
								text_pph: 'Rest 00:30 at 7.74-9.16 km/h (69m)'
							}
						]
					},
					{
						order: 3,
						type: 'cooldown',
						prior: 'distance',
						hex_graph: '#90CFF1',
						calc_time_in_sec: 715,
						hex_text: '#FFFFFF',
						time: '11:55',
						time_in_sec: 715,
						time_value: 715,
						time_unit: 'sec',
						distance: '2km',
						distance_value: 2,
						distance_unit: 'km',
						distance_unit_text: 'km',
						pace: '05:58 min/km',
						pace_value: 358,
						pace_unit: 'min/km',
						pace_per_hour: '10.06 km/h',
						pace_per_hour_value: 358,
						pace_per_hour_unit: 'km/h',
						prefer_pph: false,
						pace_range: '05:28-06:28 min/km',
						pace_range_value_min: 388,
						pace_range_value_max: 328,
						pace_per_hour_range: '9.28-10.98 km/h',
						pace_per_hour_range_value_min: 388,
						pace_per_hour_range_value_max: 328,
						text: 'Cooldown: 2km in 11:55 (05:28-06:28 min/km)',
						text_pph: 'Cooldown: 2km in 11:55 (9.28-10.98 km/h)'
					}
				],
				total_time_in_sec: 3901,
				total_distance_in_km: 13.306840000000001,
				core_time_in_sec: 1746,
				pre_advice: null,
				post_advice: null,
				core_distance: '7.2km',
				core_distance_value: 7.2,
				core_distance_unit: 'km',
				core_distance_unit_text: 'km',
				core_time: '29:06',
				core_time_value: 1746,
				core_time_unit: 'sec',
				total_distance: '13.31km',
				total_distance_value: 13.31,
				total_distance_unit: 'km',
				total_distance_unit_text: 'km',
				total_time: '01:05:01',
				total_time_value: 3901,
				total_time_unit: 'sec'
			}
		}
	]
} satisfies SaveScheduleResponse;

const newsResponse = {
	data: [
		{
			id: 82,
			title: 'New strength training levels coming soon!',
			content: 'New strength training levels will soon be available in the app.',
			video_url: 'https://www.instagram.com/reel/DcL3tTOITLf/',
			created_at: 1787065980,
			attachment: null
		},
		{
			id: 81,
			title: 'The third podcast episode is now available!',
			content: "The third episode of our 'Marathon Series' podcast is now available.",
			video_url: 'https://youtu.be/fJlCe7RPPDA',
			created_at: 1786960419,
			attachment: {
				id: 18141135,
				path: 'https://d1a3zgzalxfsjh.cloudfront.net/18141135/attachment_81.jpg',
				original_path: 'https://d1a3zgzalxfsjh.cloudfront.net/18141135/attachment_81.jpg',
				meta: null,
				size_in_kb: 1260.256,
				created_at: 1786960419,
				custom_properties: []
			}
		}
	],
	pagination: {
		total: 3,
		count: 3,
		per_page: 10,
		current_page: 1,
		total_pages: 1,
		links: {}
	}
} satisfies NewsResponse;

const shoes = [
	{
		id: 6404,
		brand: 'Adidas',
		name: 'Boston 13',
		type: 'supertrainer',
		preferred: false,
		buy_date: '2026-01-11',
		lifetime_percentage: 30.260000000000005,
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
	{
		id: 2446,
		brand: 'Other',
		name: 'La Sportiva',
		type: 'trail',
		preferred: false,
		buy_date: '2025-04-05',
		lifetime_percentage: 12.41375,
		created_at: '2025-09-10T16:23:58+02:00',
		updated_at: '2025-09-10T16:23:58+02:00',
		retired_at: null,
		expected_lifetime_distance: '800km',
		expected_lifetime_distance_value: 800,
		expected_lifetime_distance_unit: 'km',
		expected_lifetime_distance_unit_text: 'km',
		distance_done: '99.31km',
		distance_done_value: 99.31,
		distance_done_unit: 'km',
		distance_done_unit_text: 'km',
		avg_pace: '08:56 min/km',
		avg_pace_value: 536,
		avg_pace_unit: 'min/km',
		picture: null
	}
] satisfies Shoe[];

const chatMessages = {
	data: [
		{
			id: 159651,
			body: 'what type of performance tests should I do?',
			body_html: '<p>what type of performance tests should I do?</p>',
			url: null,
			user_id: 56540,
			picture_url: 'https://d1a3zgzalxfsjh.cloudfront.net/12356744/profile_picture.jpg',
			created_at: 1787388448
		},
		{
			id: 150785,
			body: 'I’d call the Boston 13 a “performance trainer”.',
			body_html: '<p>I’d call the Boston 13 a “performance trainer”.</p>',
			url: null,
			user_id: 3,
			picture_url: 'https://backend-prod.trenara.com/img/walter.png',
			created_at: 1785670653
		}
	],
	pagination: {
		total: 289,
		count: 10,
		per_page: 10,
		current_page: 1,
		total_pages: 29,
		links: {
			next: 'https://backend-prod.trenara.com/api/threads/1482/messages?timestamp=1787395648&page=2'
		}
	}
} satisfies ChatMessagesResponse;

// ─────────────────────────────────────────────────────────────
// The two bodies `PUT /api/me` was captured with: the profile
// block on its own, and the same block carrying the lactate
// thresholds. Both were accepted.
// ─────────────────────────────────────────────────────────────
const profileUpdate = {
	email: 'user@example.com',
	first_name: 'Nils',
	last_name: 'Beckmann',
	date_of_birth: '1985-07-29',
	nationality_id: 276,
	gender: 'm',
	uses_imperial: false,
	weight: 73.0,
	weight_unit: 'kg',
	height: 188.0,
	height_unit: 'cm'
} satisfies ProfileUpdate;

const profileUpdateWithThresholds = {
	...profileUpdate,
	hr_prior: false,
	pace_lt1_value: 291,
	pace_lt1_unit: 'sec_km',
	pace_lt2_value: 244,
	pace_lt2_unit: 'sec_km'
} satisfies ProfileUpdate;

// ─────────────────────────────────────────────────────────────
// What `PUT /api/entries/{id}/rpe` answers with: the whole entry,
// not an acknowledgement. The fullest `Entry` captured — the week
// payload and the dashboard's `last_entry` both arrive without
// `shoe`, and this is the only capture carrying laps.
//
// Seven of the nine laps dropped; the ones kept are verbatim and
// bracket the range (`pace_percentage` 97 on the fastest lap, 3 on
// the slowest).
// ─────────────────────────────────────────────────────────────
const entryAfterRpe = {
	id: 29626510,
	name: 'Garmin Treadmill running',
	start_time: '2026-08-31T18:42:30+02:00',
	type: 'run',
	icon: 'https://<api-host>/icons/icon__step.svg',
	total_altitude: null,
	avg_heartbeat: 151,
	rpe: 2,
	comment: null,
	strava: false,
	strava_url: null,
	garmin: true,
	polar: false,
	trenara: false,
	allow_shoe: true,
	cross_type: null,
	cross_percentage: null,
	cross_percentage_min: null,
	cross_percentage_max: null,
	ask_feedback: false,
	distance: '9.5km',
	distance_value: 9.5,
	distance_unit: 'km',
	distance_unit_text: 'km',
	time: '48:15',
	time_in_sec: 2895,
	time_value: 2895,
	time_unit: 'sec',
	pace: '05:04 min/km',
	pace_value: 304,
	pace_unit: 'min/km',
	gps_media: [
		{
			id: 18293769,
			path: 'https://<cdn-host>/18293769/gps_data_garmin_29626510.json',
			original_path: 'https://<cdn-host>/18293769/gps_data_garmin_29626510.json',
			meta: {
				gps: false,
				time: true,
				speed: true,
				points: 757,
				altitude: false,
				distance: true,
				heartbeat: true,
				compressed: true,
				normalized: true,
				integration: 'garmin',
				normalized_version: 1,
				points_before_compression: 2898,
				points_before_normalization: 759
			},
			size_in_kb: 199.614,
			created_at: 1788197814,
			custom_properties: {
				gps: false,
				time: true,
				speed: true,
				points: 757,
				altitude: false,
				distance: true,
				heartbeat: true,
				compressed: true,
				normalized: true,
				integration: 'garmin',
				normalized_version: 1,
				points_before_compression: 2898,
				points_before_normalization: 759
			}
		}
	],
	notification: {
		id: 18299227,
		title: 'Training',
		content: 'Consistency brings results, you’re setting a great example.',
		notification_type: 'training',
		// No `name`, no `goal` — the two the type used to demand.
		metadata: {
			goal_daily_tss: 63.5395,
			goal_pvt_tss: 64,
			done_tss: 59.882,
			type: 'training_normal'
		},
		training_id: null,
		entry_id: 29626510,
		medal_id: null,
		created_at: '2026-08-31T19:36:48+02:00',
		actions: ['share'],
		server_actionable: false
	},
	laps: [
		{
			id: 290648519,
			order: 0,
			pace_percentage: 50,
			heartbeat: 141,
			altitude: 0,
			type: 'lap',
			time: '05:02',
			time_in_sec: 302,
			time_value: 302,
			time_unit: 'sec',
			pace: '05:10 min/km',
			pace_value: 310,
			pace_unit: 'min/km',
			distance: '1km',
			distance_value: 1,
			distance_unit: 'km',
			distance_unit_text: 'km',
			sum_distance: '1km',
			sum_distance_value: 1,
			sum_distance_unit: 'km',
			sum_distance_unit_text: 'km'
		},
		{
			id: 290648520,
			order: 1,
			pace_percentage: 97,
			heartbeat: 150,
			altitude: 0,
			type: 'lap',
			time: '05:00',
			time_in_sec: 300,
			time_value: 300,
			time_unit: 'sec',
			pace: '04:59 min/km',
			pace_value: 299,
			pace_unit: 'min/km',
			distance: '1km',
			distance_value: 1,
			distance_unit: 'km',
			distance_unit_text: 'km',
			sum_distance: '2km',
			sum_distance_value: 2,
			sum_distance_unit: 'km',
			sum_distance_unit_text: 'km'
		},
		{
			id: 290648527,
			order: 8,
			pace_percentage: 3,
			heartbeat: 154,
			altitude: 0,
			type: 'lap',
			time: '05:05',
			time_in_sec: 305,
			time_value: 305,
			time_unit: 'sec',
			pace: '05:22 min/km',
			pace_value: 322,
			pace_unit: 'min/km',
			distance: '999m',
			distance_value: 999,
			distance_unit: 'm',
			distance_unit_text: 'm',
			sum_distance: '9.01km',
			sum_distance_value: 9.01,
			sum_distance_unit: 'km',
			sum_distance_unit_text: 'km'
		}
	],
	splits: [],
	shoe: {
		id: 4141,
		brand: 'Nike',
		name: 'Invincible Run 3',
		type: 'long_run',
		preferred: false,
		buy_date: '2025-10-19',
		lifetime_percentage: 45.56250000000001,
		created_at: '2025-10-20T13:22:07+02:00',
		updated_at: '2025-10-20T13:22:07+02:00',
		retired_at: null,
		expected_lifetime_distance: '800km',
		expected_lifetime_distance_value: 800,
		expected_lifetime_distance_unit: 'km',
		expected_lifetime_distance_unit_text: 'km',
		distance_done: '364.5km',
		distance_done_value: 364.5,
		distance_done_unit: 'km',
		distance_done_unit_text: 'km',
		avg_pace: '05:14 min/km',
		avg_pace_value: 314,
		avg_pace_unit: 'min/km',
		picture: null
	}
} satisfies Entry;

// ─────────────────────────────────────────────────────────────
// The assertions below are incidental — they keep vitest happy and
// document a few quirks. The compile-time `satisfies` above is the
// real test.
// ─────────────────────────────────────────────────────────────
describe('captured payloads', () => {
	// The response to a rating is the entry itself, which is what lets a
	// caller adopt the server's copy rather than patch the one it holds.
	it('answers a rating with the value stored and the prompt retired', () => {
		expect(entryAfterRpe.rpe).toBe(2);
		expect(entryAfterRpe.ask_feedback).toBe(false);
	});

	// `allow_shoe` says a shoe may be attached; `shoe` is the attached one,
	// and only this endpoint has ever been seen carrying it.
	it('carries the attached shoe, not merely permission to attach one', () => {
		expect(entryAfterRpe.allow_shoe).toBe(true);
		expect(entryAfterRpe.shoe?.name).toBe('Invincible Run 3');
	});

	// A `"training"` notification's metadata is the load figures alone. The
	// `name`/`goal` pair belongs to `AddEntryResponse`, and typing both as
	// required described a payload the API does not send.
	it('sends notification metadata that varies by notification type', () => {
		expect(entryAfterRpe.notification?.metadata).toEqual({
			goal_daily_tss: 63.5395,
			goal_pvt_tss: 64,
			done_tss: 59.882,
			type: 'training_normal'
		});
	});

	// Not a share of a target: the laps are spread across their own range,
	// so the same pace scores differently in a different session. Displaying
	// it as "97% of plan" would be wrong.
	it('scores lap pace against the session, not against a target', () => {
		const [first, fastest, slowest] = entryAfterRpe.laps;

		expect(fastest.pace_value).toBeLessThan(first.pace_value);
		expect(fastest.pace_percentage).toBeGreaterThan(first.pace_percentage);
		expect(slowest.pace_value).toBeGreaterThan(first.pace_value);
		expect(slowest.pace_percentage).toBeLessThan(first.pace_percentage);
	});

	// A treadmill run: no climb per lap and no climb overall, reported as two
	// different things. Summing the laps would turn "unknown" into "zero".
	it('reports absent altitude as zero per lap and null overall', () => {
		expect(entryAfterRpe.total_altitude).toBeNull();
		expect(entryAfterRpe.laps.every((lap) => lap.altitude === 0)).toBe(true);
	});

	// Page 1 is the most recent messages, and `links.next` pages backwards
	// through history. Rendering the response as it arrives puts the newest
	// message at the top of the thread, which is not how a chat reads.
	it('returns chat messages newest first', () => {
		const [newest, older] = chatMessages.data;
		expect(newest.created_at).toBeGreaterThan(older.created_at);
		expect(chatMessages.pagination.links.next).toContain('page=2');
	});

	// The write body is a different shape from the account it answers with:
	// the thresholds are flat here, and `pace_lt1_unit_trans` — the label the
	// read side carries next to them — is not ours to send.
	it('sends lactate thresholds flat, without the read-side labels', () => {
		expect(profileUpdateWithThresholds.pace_lt1_value).toBe(291);
		expect(profileUpdateWithThresholds.pace_lt1_unit).toBe('sec_km');
		expect(profileUpdateWithThresholds).not.toHaveProperty('pace_lt1_unit_trans');
		expect(profileUpdate).not.toHaveProperty('pace_lt1_value');
	});

	// LT1 is the aerobic threshold and LT2 the anaerobic one, so in seconds
	// per kilometre LT1 is the larger number. Swapping them would be accepted
	// by the backend and silently wrong.
	it('orders the thresholds LT1 slower than LT2', () => {
		expect(profileUpdateWithThresholds.pace_lt1_value).toBeGreaterThan(
			profileUpdateWithThresholds.pace_lt2_value
		);
	});

	it('models a cross-trained session as duration-only', () => {
		const ride = crossTrainDetail.training.blocks[0].blocks[0];
		expect(ride.distance_value).toBeNull();
		expect(ride.pace_value).toBeNull();
		expect(ride.time_in_sec).toBe(6223);
		// The block stays type "run" even though it is a bike ride.
		expect(ride.type).toBe('run');
		expect(crossTrainDetail.training_condition).toBeNull();
		expect(crossTrainDetail.suggested_shoe).toBeNull();
	});

	it('counts repetitions, not percentages, on an interval distance package', () => {
		// The same field carries two different meanings depending on the session:
		// -30 for "-30%" on a steady run, 2 for "2x" here. Never do arithmetic on
		// it — hand a step's value back and render its text.
		const steps = intervalDetail.change_distance_package.steps;
		expect(steps.map((s) => s.value)).toEqual([1, 2, 3]);
		expect(steps.map((s) => s.text)).toEqual(['1x', '2x', '3x']);
		expect(intervalDetail.change_distance_package.title).toBe('Fine-tune intervals');
	});

	it('carries two different meanings in one distance package field', () => {
		// Captured from the same endpoint, PUT .../distance, on two sessions:
		// { distance_value: -5 } shifts a steady run by 5%, { distance_value: 2 }
		// asks an interval session for two reps. Nothing in the payload marks
		// which kind you have except the steps themselves.
		const percentages = exchangeCandidate.change_distance_package.steps;
		const repetitions = intervalDetail.change_distance_package.steps;
		expect(percentages.every((s) => s.text.endsWith('%'))).toBe(true);
		expect(repetitions.every((s) => s.text.endsWith('x'))).toBe(true);
	});

	it('offers no "as planned" step on a repetition package', () => {
		// The intensity package has one, so a step other than 0 is a deviation.
		// The repetition package does not, so `selected` says which is applied
		// but nothing says which was planned.
		const reps = intervalDetail.change_distance_package.steps;
		const intensity = intervalDetail.change_intensity_package.steps;
		expect(reps.some((s) => s.value === 0)).toBe(false);
		expect(intensity.some((s) => s.value === 0)).toBe(true);
	});

	it('drops the cool-down block when the cool-down is off', () => {
		expect(intervalDetail.can_toggle_cooldown).toBe(true);
		expect(intervalDetail.has_cooldown).toBe(false);
		const types = intervalDetail.training.blocks.map((b) => b.type);
		expect(types).not.toContain('cooldown');
	});

	it('stores intensity as 100 plus the applied step value', () => {
		const applied = runDetail.change_intensity_package.steps.find((s) => s.selected);
		expect(applied?.value).toBe(-2);
		expect(runDetail.training_condition.intensity).toBe(100 + applied!.value);
	});

	it('reports the applied step in the package, not in training_condition', () => {
		// This session has a distance step applied and an intensity step
		// selected, and no training_condition at all. Reading either setting
		// from the condition would show nothing here — `selected` is the source.
		expect(steadyRunDetail.training_condition).toBeNull();
		expect(steadyRunDetail.change_distance_package.steps.find((s) => s.selected)?.value).toBe(-5);
		expect(steadyRunDetail.change_intensity_package.steps.find((s) => s.selected)?.value).toBe(0);
	});

	it('varies the step count per session, so nothing may assume one', () => {
		// Four steps on the tempo run, five here — the coach caps the range per
		// training, which is why the package is rendered rather than generated.
		expect(runDetail.change_intensity_package.steps).toHaveLength(4);
		expect(steadyRunDetail.change_intensity_package.steps).toHaveLength(5);
		expect(intervalDetail.change_intensity_package.steps).toHaveLength(5);
	});

	it('reports pace ranges with min slower than max', () => {
		// Blocks are a union of group and leaf shapes, so narrow to a leaf
		// that actually carries a range before comparing.
		const [warmup] = runDetail.training.blocks;
		const slowEnd = warmup.pace_range_value_min ?? 0;
		const fastEnd = warmup.pace_range_value_max ?? 0;
		// Seconds per km, so the "min" end holds the larger number.
		expect(slowEnd).toBe(425);
		expect(fastEnd).toBe(359);
		expect(slowEnd).toBeGreaterThan(fastEnd);
	});

	it('derives shoe lifetime percentage from distance done', () => {
		for (const shoe of shoes) {
			const expected = (shoe.distance_done_value / shoe.expected_lifetime_distance_value) * 100;
			expect(shoe.lifetime_percentage).toBeCloseTo(expected, 6);
		}
	});

	it('paginates news and chat with the same envelope', () => {
		expect(Object.keys(newsResponse.pagination).sort()).toEqual(
			Object.keys(chatMessages.pagination).sort()
		);
	});

	it('sends every capability flag and change package with the week', () => {
		// The reason the chip rail can be drawn before the detail arrives. This
		// was assumed the other way round for a long time, on no evidence.
		for (const key of [
			'can_cross_train',
			'can_be_exchanged',
			'can_change_intensity',
			'can_change_distance',
			'can_toggle_cooldown',
			'change_intensity_package',
			'change_distance_package',
			'has_cooldown',
			'cross_type'
		]) {
			expect(WEEK_TRAINING_KEYS).toContain(key);
		}
	});

	it('leaves terrain and shoe out of the week entirely', () => {
		// Absent, not null — the distinction the setup UI is built on: a value
		// this copy does not carry is unknown, not unset.
		expect(WEEK_TRAINING_KEYS).not.toContain('training_condition');
		expect(WEEK_TRAINING_KEYS).not.toContain('suggested_shoe');

		// Both are on the detail, which is what the per-day fetch is still for.
		expect(runDetail).toHaveProperty('training_condition');
		expect(runDetail).toHaveProperty('suggested_shoe');
	});

	it('pins the week key list to the captured week', () => {
		const [adjusted] = weekWithAdjustment.trainings;
		expect(Object.keys(adjusted).sort()).toEqual([...WEEK_TRAINING_KEYS]);
	});

	// The coach's own adjustment: the plan said 10km, the schedule says 11km,
	// and the two figures are in different units. The runner's own distance
	// steps are withdrawn while it stands.
	it('reports an adjusted session in kilometres before and metres after', () => {
		const [easy] = weekWithAdjustment.trainings;
		expect(easy.has_intelligence).toBe(true);
		expect(easy.original_distance_km * 1000).toBe(10000);
		expect(easy.base_distance).toBe(11000);
		expect(easy.training.blocks[0]?.distance).toBe('11km');
		expect(easy.intelligence_distance_value).toBe(-1000);
		expect(easy.can_change_distance).toBe(false);
		expect(easy.change_distance_package).toBeNull();
	});

	it('leaves every adjustment field null on a session the coach left alone', () => {
		expect(addedTraining.has_intelligence).toBe(false);
		expect(addedTraining.base_distance).toBeNull();
		expect(addedTraining.intelligence_text).toBeNull();
		expect(addedTraining.intelligence_distance_value).toBeNull();
	});

	// Same field, two types: a number on a week, a boolean on a candidate and
	// on the training adding one returns.
	it('sends distance_limit as 0 on a week and false on a new training', () => {
		expect(weekWithAdjustment.trainings[0]?.distance_limit).toBe(0);
		expect(newTrainingCandidate.distance_limit).toBe(false);
		expect(addedTraining.distance_limit).toBe(false);
	});

	it('offers new trainings dated on the day asked about, by template id', () => {
		expect(newTrainingCandidate.day_long).toBe(addNewTrainingBody.date);
		expect(newTrainingCandidate.id).toBe(addNewTrainingBody.training_id);
		expect(newTrainingCandidate).not.toHaveProperty('team_data');
		expect(newTrainingCandidate).not.toHaveProperty('training_condition');
	});

	// The added training is a scheduled one with an id of its own, and it is
	// serialised like a detail: team, conditions and shoe all present.
	it('answers an added training with a new scheduled id and the full detail', () => {
		expect(addedTraining.id).toBeGreaterThan(newTrainingCandidate.id);
		expect(addedTraining.title).toBe(newTrainingCandidate.title);
		expect(addedTraining.day).toBe(newTrainingCandidate.day);
		expect(addedTraining).toHaveProperty('training_condition', null);
		expect(addedTraining).toHaveProperty('suggested_shoe', null);
		expect(addedTraining.team_data?.team_id).toBe(470);
	});

	// The trap in this response: `day_long` is the UTC instant of the
	// runner's local midnight, so its first ten characters name the day before.
	// `day` is the same unix second the candidate and the week both carry.
	it('dates the added training by an instant in day_long, the day before in UTC', () => {
		expect(addedTraining.day_long).toBe('2026-10-09T22:00:00.000000Z');
		expect(addedTraining.day_long.slice(0, 10)).not.toBe(addNewTrainingBody.date);
		expect(new Date(addedTraining.day * 1000).toISOString()).toBe('2026-10-09T22:00:00.000Z');
	});

	it('removes a training with a body that carries no date', () => {
		expect(removeBody.action).toBe('destroy');
		expect(removeBody).not.toHaveProperty('target_date');
	});

	// The dry run's goal is its own serialisation: dates in unix seconds, not
	// the strings `/api/goal` sends.
	it('answers the dry run with a goal dated in unix seconds and a new time', () => {
		expect(typeof removeTest.goal.end_date).toBe('number');
		expect(removeTest.goal.end_date_text).toBe('2026-12-06');
		expect(removeTest.goal_possible).toBe(true);
		expect(removeTest.new_goal_time).toBeGreaterThan(removeTest.goal.time_in_sec);
	});

	it('answers the removal with its week, re-opened and without its other collections', () => {
		expect(removeSave.id).toBe(39515460);
		expect(removeSave.can_receive_new_trainings).toBe(true);
		expect(removeSave).not.toHaveProperty('strength_trainings');
		expect(removeSave).not.toHaveProperty('entries');
		expect(removeSave.trainings.map((t) => t.id)).not.toContain(addedTraining.id);
	});

	it('offers exchange candidates with ids from a different space than the schedule id', () => {
		// Candidate ids are small; scheduled training ids are nine digits.
		expect(exchangeCandidate.id).toBeLessThan(runDetail.id);
	});

	it('offers the pacing plan on the goal race alone, as three named strategies', () => {
		expect(raceDetail.can_change_pacing_plan).toBe(true);
		expect(runDetail.can_change_pacing_plan).toBe(false);
		expect(crossTrainDetail.can_change_pacing_plan).toBe(false);

		// Not a ChangePackage: the field is the array of options itself, and
		// `value` is a strategy name, never a number.
		const values = raceDetail.change_pacing_plan_package.map((o) => o.value);
		expect(values).toEqual(['trenara', 'alternative', null]);
		expect(raceDetail.change_pacing_plan_package.find((o) => o.selected)?.title).toBe(
			'No pacing plan'
		);
	});

	it('locks every other setting on the goal race, and cannot be exchanged', () => {
		// The pacing plan is the only thing on offer: no cross-training, no
		// distance change, no exchange, and the session itself cannot be edited
		// or deleted like an ordinary training.
		expect(raceDetail.can_be_edited).toBe(false);
		expect(raceDetail.can_cross_train).toBe(false);
		expect(raceDetail.can_change_distance).toBe(false);
		expect(raceDetail.can_be_exchanged).toBe(false);
		// Effort is still open — even race day accepts an intensity nudge.
		expect(raceDetail.can_change_intensity).toBe(true);
	});
});
