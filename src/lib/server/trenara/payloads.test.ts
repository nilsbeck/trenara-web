import { describe, it, expect } from 'vitest';
import type {
	ChatMessagesResponse,
	ExchangeCandidate,
	NewsResponse,
	ScheduledTrainingDetail,
	Shoe
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
// The assertions below are incidental — they keep vitest happy and
// document a few quirks. The compile-time `satisfies` above is the
// real test.
// ─────────────────────────────────────────────────────────────
describe('captured payloads', () => {
	// Page 1 is the most recent messages, and `links.next` pages backwards
	// through history. Rendering the response as it arrives puts the newest
	// message at the top of the thread, which is not how a chat reads.
	it('returns chat messages newest first', () => {
		const [newest, older] = chatMessages.data;
		expect(newest.created_at).toBeGreaterThan(older.created_at);
		expect(chatMessages.pagination.links.next).toContain('page=2');
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

	it('offers exchange candidates with ids from a different space than the schedule id', () => {
		// Candidate ids are small; scheduled training ids are nine digits.
		expect(exchangeCandidate.id).toBeLessThan(runDetail.id);
	});
});
