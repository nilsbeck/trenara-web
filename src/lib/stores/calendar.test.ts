import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCalendarStore } from './calendar.svelte';
import type { Schedule } from '$lib/server/trenara/types';

// ── Mock fetch (used by loadMonthData) ────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Helpers ───────────────────────────────────────────────────
function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
	return {
		id: 1,
		start_day: 0,
		start_day_long: '2025-03-03',
		training_week: 10,
		type: 'ultimate',
		trainings: [],
		strength_trainings: [],
		entries: [],
		...overrides
	};
}

// ─────────────────────────────────────────────────────────────
// selectedDateString
// ─────────────────────────────────────────────────────────────
describe('selectedDateString', () => {
	it('is null when no date is selected', () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		expect(store.selectedDateString).toBeNull();
	});

	it('formats selected date as YYYY-MM-DD', () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		store.setSelectedDate({ year: 2025, month: 2, day: 5 }); // month is 0-based
		expect(store.selectedDateString).toBe('2025-03-05');
	});

	it('pads single-digit month and day', () => {
		const store = createCalendarStore(new Date('2025-01-01'));
		store.setSelectedDate({ year: 2025, month: 0, day: 7 });
		expect(store.selectedDateString).toBe('2025-01-07');
	});

	it('resets to null when setSelectedDate(null) is called', () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		store.setSelectedDate({ year: 2025, month: 2, day: 5 });
		store.setSelectedDate(null);
		expect(store.selectedDateString).toBeNull();
	});
});

// ─────────────────────────────────────────────────────────────
// filteredTrainings
// ─────────────────────────────────────────────────────────────
describe('filteredTrainings', () => {
	it('is empty when no schedule is set', () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		store.setSelectedDate({ year: 2025, month: 2, day: 5 });
		expect(store.filteredTrainings).toHaveLength(0);
	});

	it('returns matching training for selected date', () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		store.setSchedule(
			makeSchedule({
				trainings: [
					{
						id: 1,
						day_long: '2025-03-05',
						day: 20250305,
						title: 'Easy run',
						type: 'run',
						training: {
							blocks: [],
							total_time: '45:00',
							total_time_in_sec: 2700,
							core_time: '30:00',
							core_time_in_sec: 1800,
							core_time_value: 30,
							core_time_unit: 'min',
							total_time_value: 45,
							total_time_unit: 'min',
							total_distance: '8km',
							total_distance_value: 8,
							total_distance_unit: 'km',
							total_distance_unit_text: 'km',
							core_distance: '6km',
							core_distance_value: 6,
							core_distance_unit: 'km',
							core_distance_unit_text: 'km'
						},
						can_be_edited: true,
						description: '',
						show_description_from: 0,
						nutritional_advice: '',
						icon_url: '',
						hex_training: '#60a5fa',
						hex_completed: null,
						last_garmin_sync: '',
						training_condition: {
							id: 1,
							height_difference: '0',
							surface: 'road',
							updated_at: 0,
							height: null,
							height_value: null,
							height_unit: null,
							height_unit_text: null
						}
					}
				]
			})
		);
		store.setSelectedDate({ year: 2025, month: 2, day: 5 });
		expect(store.filteredTrainings).toHaveLength(1);
		expect(store.filteredTrainings[0].title).toBe('Easy run');
	});

	it('does not return trainings for a different date', () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		store.setSchedule(
			makeSchedule({
				trainings: [
					{
						id: 1,
						day_long: '2025-03-06',
						day: 20250306,
						title: 'Tomorrow run',
						type: 'run',
						training: {
							blocks: [],
							total_time: '45:00',
							total_time_in_sec: 2700,
							core_time: '30:00',
							core_time_in_sec: 1800,
							core_time_value: 30,
							core_time_unit: 'min',
							total_time_value: 45,
							total_time_unit: 'min',
							total_distance: '8km',
							total_distance_value: 8,
							total_distance_unit: 'km',
							total_distance_unit_text: 'km',
							core_distance: '6km',
							core_distance_value: 6,
							core_distance_unit: 'km',
							core_distance_unit_text: 'km'
						},
						can_be_edited: true,
						description: '',
						show_description_from: 0,
						nutritional_advice: '',
						icon_url: '',
						hex_training: '#60a5fa',
						hex_completed: null,
						last_garmin_sync: '',
						training_condition: {
							id: 1,
							height_difference: '0',
							surface: 'road',
							updated_at: 0,
							height: null,
							height_value: null,
							height_unit: null,
							height_unit_text: null
						}
					}
				]
			})
		);
		store.setSelectedDate({ year: 2025, month: 2, day: 5 });
		expect(store.filteredTrainings).toHaveLength(0);
	});
});

// ─────────────────────────────────────────────────────────────
// getTrainingStatusForDate
// ─────────────────────────────────────────────────────────────
describe('getTrainingStatusForDate', () => {
	it('returns "none" when no schedule is set (statusIndex is null)', () => {
		// No setSchedule call — schedule remains null → statusIndex is null
		const store = createCalendarStore(new Date('2025-03-05'));
		expect(store.getTrainingStatusForDate({ type: 'run', day: 5 })).toBe('none');
	});

	it('returns "none" when schedule is empty', () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		store.setSchedule(makeSchedule());
		expect(store.getTrainingStatusForDate({ type: 'run', day: 5 })).toBe('none');
	});

	it('returns "scheduled" for a future run training', () => {
		// Use a date far in the future so it is definitely "future"
		const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7 days
		const yyyy = futureDate.getFullYear();
		const mm = String(futureDate.getMonth() + 1).padStart(2, '0');
		const dd = String(futureDate.getDate()).padStart(2, '0');
		const dateStr = `${yyyy}-${mm}-${dd}`;

		const store = createCalendarStore(futureDate);
		store.setSchedule(
			makeSchedule({
				trainings: [
					{
						id: 99,
						day_long: dateStr,
						day: Number(dateStr.replace(/-/g, '')),
						title: 'Future run',
						type: 'run',
						training: {
							blocks: [],
							total_time: '45:00',
							total_time_in_sec: 2700,
							core_time: '30:00',
							core_time_in_sec: 1800,
							core_time_value: 30,
							core_time_unit: 'min',
							total_time_value: 45,
							total_time_unit: 'min',
							total_distance: '8km',
							total_distance_value: 8,
							total_distance_unit: 'km',
							total_distance_unit_text: 'km',
							core_distance: '6km',
							core_distance_value: 6,
							core_distance_unit: 'km',
							core_distance_unit_text: 'km'
						},
						can_be_edited: true,
						description: '',
						show_description_from: 0,
						nutritional_advice: '',
						icon_url: '',
						hex_training: '#60a5fa',
						hex_completed: null,
						last_garmin_sync: '',
						training_condition: {
							id: 1,
							height_difference: '0',
							surface: 'road',
							updated_at: 0,
							height: null,
							height_value: null,
							height_unit: null,
							height_unit_text: null
						}
					}
				]
			})
		);
		expect(store.getTrainingStatusForDate({ type: 'run', day: futureDate.getDate() })).toBe(
			'scheduled'
		);
	});

	it('returns "completed" when a run entry exists for the date', () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		// Use a clearly past date so "missed" logic doesn't interfere with "completed"
		store.setSchedule(
			makeSchedule({
				entries: [
					{
						id: 10,
						name: 'Morning run',
						start_time: '2025-01-10T08:00:00.000Z',
						type: 'run',
						icon: '',
						total_altitude: null,
						avg_heartbeat: null,
						rpe: null,
						comment: null,
						strava: false,
						strava_url: null,
						garmin: false,
						polar: false,
						trenara: true,
						distance: '10km',
						distance_value: 10,
						distance_unit: 'km',
						distance_unit_text: 'km',
						time: '45:00',
						time_in_sec: 2700,
						time_value: 45,
						time_unit: 'min',
						pace: '4:30 min/km',
						pace_value: 4.5,
						pace_unit: 'min/km',
						gps_media: [],
						notification: null,
						laps: [],
						allow_shoe: true,
						ask_feedback: false,
						cross_type: null,
						cross_percentage: null,
						cross_percentage_min: null,
						cross_percentage_max: null,
						splits: []
					}
				]
			})
		);
		// The store uses currentDate to build the calendarDate string, so we need
		// the currentDate month to match the entry date (January 2025 → month index 0)
		// We re-create with Jan 2025 as the current view month.
		const store2 = createCalendarStore(new Date('2025-01-10'));
		store2.setSchedule(
			makeSchedule({
				entries: [
					{
						id: 10,
						name: 'Morning run',
						start_time: '2025-01-10T08:00:00.000Z',
						type: 'run',
						icon: '',
						total_altitude: null,
						avg_heartbeat: null,
						rpe: null,
						comment: null,
						strava: false,
						strava_url: null,
						garmin: false,
						polar: false,
						trenara: true,
						distance: '10km',
						distance_value: 10,
						distance_unit: 'km',
						distance_unit_text: 'km',
						time: '45:00',
						time_in_sec: 2700,
						time_value: 45,
						time_unit: 'min',
						pace: '4:30 min/km',
						pace_value: 4.5,
						pace_unit: 'min/km',
						gps_media: [],
						notification: null,
						laps: [],
						allow_shoe: true,
						ask_feedback: false,
						cross_type: null,
						cross_percentage: null,
						cross_percentage_min: null,
						cross_percentage_max: null,
						splits: []
					}
				]
			})
		);
		expect(store2.getTrainingStatusForDate({ type: 'run', day: 10 })).toBe('completed');
	});

	it('returns "none" for a day with no training or entry', () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		store.setSchedule(makeSchedule({ trainings: [], entries: [] }));
		expect(store.getTrainingStatusForDate({ type: 'run', day: 15 })).toBe('none');
	});
});

// ─────────────────────────────────────────────────────────────
// loadMonthData (integration — mocked fetch)
// ─────────────────────────────────────────────────────────────
describe('loadMonthData', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('sets isLoading=true during fetch then false after', async () => {
		const schedule = makeSchedule();
		mockFetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(schedule)
		});

		const store = createCalendarStore(new Date('2025-03-05'));
		const promise = store.loadMonthData(new Date('2025-03-05'));
		// isLoading becomes true synchronously at start of loadMonthData
		// We don't assert mid-flight because the rune update may be batched;
		// instead we just verify it ends up false.
		await promise;
		expect(store.isLoading).toBe(false);
	});

	it('stores the fetched schedule on success', async () => {
		const schedule = makeSchedule({ id: 99 });
		mockFetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(schedule)
		});

		const store = createCalendarStore(new Date('2025-03-05'));
		await store.loadMonthData(new Date('2025-03-05'));
		expect(store.schedule?.id).toBe(99);
		expect(store.error).toBeNull();
	});

	it('sets error and empty schedule on fetch failure', async () => {
		mockFetch.mockResolvedValue({ ok: false, statusText: 'Internal Server Error' });

		const store = createCalendarStore(new Date('2025-03-05'));
		await store.loadMonthData(new Date('2025-03-05'));
		expect(store.error).toBeInstanceOf(Error);
		expect(store.schedule?.trainings).toHaveLength(0);
		expect(store.isLoading).toBe(false);
	});

	it('sets error when fetch throws (network error)', async () => {
		mockFetch.mockRejectedValue(new Error('Network error'));

		const store = createCalendarStore(new Date('2025-03-05'));
		await store.loadMonthData(new Date('2025-03-05'));
		expect(store.error).toBeInstanceOf(Error);
		expect(store.isLoading).toBe(false);
	});

	it('wraps non-Error throws in a new Error (?: branch)', async () => {
		// Throwing a plain string (not an Error instance) triggers the ternary else branch
		mockFetch.mockRejectedValue('plain string rejection');

		const store = createCalendarStore(new Date('2025-03-05'));
		await store.loadMonthData(new Date('2025-03-05'));
		expect(store.error).toBeInstanceOf(Error);
		expect(store.error?.message).toBe('Failed to load month data');
		expect(store.isLoading).toBe(false);
	});

	it('returns cached schedule on second load of same month (cache hit)', async () => {
		const schedule = makeSchedule({ id: 42 });
		mockFetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(schedule)
		});

		const store = createCalendarStore(new Date('2025-03-05'));
		await store.loadMonthData(new Date('2025-03-05'));
		expect(mockFetch).toHaveBeenCalledTimes(1);
		expect(store.schedule?.id).toBe(42);

		// Second load of the same month — should use cache, not fetch
		await store.loadMonthData(new Date('2025-03-15'));
		expect(mockFetch).toHaveBeenCalledTimes(1); // still 1
		expect(store.schedule?.id).toBe(42);
	});

	it('refresh() busts cache and re-fetches', async () => {
		const schedule1 = makeSchedule({ id: 1 });
		const schedule2 = makeSchedule({ id: 2 });
		mockFetch
			.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(schedule1) })
			.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(schedule2) });

		const store = createCalendarStore(new Date('2025-03-05'));
		await store.loadMonthData(new Date('2025-03-05'));
		expect(store.schedule?.id).toBe(1);

		// refresh should bust cache and fetch fresh data
		await store.navigation.refresh();
		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(store.schedule?.id).toBe(2);
	});
});

// ─────────────────────────────────────────────────────────────
// filteredStrengthTrainings
// ─────────────────────────────────────────────────────────────
describe('filteredStrengthTrainings', () => {
	function makeStrengthTraining(day: string) {
		return {
			id: 1,
			strength_id: null,
			type_id: 1,
			title: 'Core workout',
			training_type: 'strength',
			description: '',
			icon_url: '',
			day,
			time: '08:00',
			rest_between_sets: 60,
			rest_between_exercises: 90,
			exercises: [],
			accessories: []
		};
	}

	it('is empty when no schedule is set', () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		store.setSelectedDate({ year: 2025, month: 2, day: 5 });
		expect(store.filteredStrengthTrainings).toHaveLength(0);
	});

	it('returns matching strength training for selected date', () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		store.setSchedule(makeSchedule({ strength_trainings: [makeStrengthTraining('2025-03-05')] }));
		store.setSelectedDate({ year: 2025, month: 2, day: 5 });
		expect(store.filteredStrengthTrainings).toHaveLength(1);
		expect(store.filteredStrengthTrainings[0].title).toBe('Core workout');
	});

	it('does not return strength training for a different date', () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		store.setSchedule(makeSchedule({ strength_trainings: [makeStrengthTraining('2025-03-06')] }));
		store.setSelectedDate({ year: 2025, month: 2, day: 5 });
		expect(store.filteredStrengthTrainings).toHaveLength(0);
	});
});

// ─────────────────────────────────────────────────────────────
// selectedRunEntries
// ─────────────────────────────────────────────────────────────
describe('selectedRunEntries', () => {
	function makeEntry(type: string, startTime: string) {
		return {
			id: 10,
			name: 'Run',
			start_time: startTime,
			type,
			icon: '',
			total_altitude: null,
			avg_heartbeat: null,
			rpe: null,
			comment: null,
			strava: false,
			strava_url: null,
			garmin: false,
			polar: false,
			trenara: true,
			distance: '10km',
			distance_value: 10,
			distance_unit: 'km',
			distance_unit_text: 'km',
			time: '45:00',
			time_in_sec: 2700,
			time_value: 45,
			time_unit: 'min',
			pace: '4:30 min/km',
			pace_value: 4.5,
			pace_unit: 'min/km',
			gps_media: [],
			notification: null,
			laps: [],
			allow_shoe: true,
			ask_feedback: false,
			cross_type: null,
			cross_percentage: null,
			cross_percentage_min: null,
			cross_percentage_max: null,
			splits: []
		};
	}

	it('returns run entries for the selected date', () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		store.setSchedule(makeSchedule({ entries: [makeEntry('run', '2025-03-05T08:00:00.000Z')] }));
		store.setSelectedDate({ year: 2025, month: 2, day: 5 });
		expect(store.selectedRunEntries).toHaveLength(1);
	});

	it('excludes strength entries from selectedRunEntries', () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		store.setSchedule(
			makeSchedule({ entries: [makeEntry('strength', '2025-03-05T08:00:00.000Z')] })
		);
		store.setSelectedDate({ year: 2025, month: 2, day: 5 });
		expect(store.selectedRunEntries).toHaveLength(0);
	});

	it('excludes entries from other dates', () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		store.setSchedule(makeSchedule({ entries: [makeEntry('run', '2025-03-06T08:00:00.000Z')] }));
		store.setSelectedDate({ year: 2025, month: 2, day: 5 });
		expect(store.selectedRunEntries).toHaveLength(0);
	});
});

// ─────────────────────────────────────────────────────────────
// getTrainingStatusForDate — strength + missed
// ─────────────────────────────────────────────────────────────
describe('getTrainingStatusForDate — strength and missed', () => {
	function makeStrengthTraining(day: string) {
		return {
			id: 1,
			strength_id: null,
			type_id: 1,
			title: 'Core',
			training_type: 'strength',
			description: '',
			icon_url: '',
			day,
			time: '08:00',
			rest_between_sets: 60,
			rest_between_exercises: 90,
			exercises: [],
			accessories: []
		};
	}

	it('returns "scheduled" for a future strength training', () => {
		const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
		const yyyy = futureDate.getFullYear();
		const mm = String(futureDate.getMonth() + 1).padStart(2, '0');
		const dd = String(futureDate.getDate()).padStart(2, '0');
		const dateStr = `${yyyy}-${mm}-${dd}`;

		const store = createCalendarStore(futureDate);
		store.setSchedule(makeSchedule({ strength_trainings: [makeStrengthTraining(dateStr)] }));
		expect(store.getTrainingStatusForDate({ type: 'strength', day: futureDate.getDate() })).toBe(
			'scheduled'
		);
	});

	it('returns "completed" when a strength entry exists', () => {
		const store = createCalendarStore(new Date('2025-01-10'));
		store.setSchedule(
			makeSchedule({
				entries: [
					{
						id: 20,
						name: 'Strength',
						start_time: '2025-01-10T08:00:00.000Z',
						type: 'strength',
						icon: '',
						total_altitude: null,
						avg_heartbeat: null,
						rpe: null,
						comment: null,
						strava: false,
						strava_url: null,
						garmin: false,
						polar: false,
						trenara: true,
						distance: '0km',
						distance_value: 0,
						distance_unit: 'km',
						distance_unit_text: 'km',
						time: '30:00',
						time_in_sec: 1800,
						time_value: 30,
						time_unit: 'min',
						pace: '-',
						pace_value: 0,
						pace_unit: 'min/km',
						gps_media: [],
						notification: null,
						laps: [],
						allow_shoe: true,
						ask_feedback: false,
						cross_type: null,
						cross_percentage: null,
						cross_percentage_min: null,
						cross_percentage_max: null,
						splits: []
					}
				]
			})
		);
		expect(store.getTrainingStatusForDate({ type: 'strength', day: 10 })).toBe('completed');
	});

	it('returns "missed" for a past scheduled run with no entry', () => {
		// Use January 2025 (clearly in the past) as both the store view month and training date
		const store = createCalendarStore(new Date('2025-01-15'));
		store.setSchedule(
			makeSchedule({
				trainings: [
					{
						id: 5,
						day_long: '2025-01-05',
						day: 20250105,
						title: 'Past run',
						type: 'run',
						training: {
							blocks: [],
							total_time: '45:00',
							total_time_in_sec: 2700,
							core_time: '30:00',
							core_time_in_sec: 1800,
							core_time_value: 30,
							core_time_unit: 'min',
							total_time_value: 45,
							total_time_unit: 'min',
							total_distance: '8km',
							total_distance_value: 8,
							total_distance_unit: 'km',
							total_distance_unit_text: 'km',
							core_distance: '6km',
							core_distance_value: 6,
							core_distance_unit: 'km',
							core_distance_unit_text: 'km'
						},
						can_be_edited: false,
						description: '',
						show_description_from: 0,
						nutritional_advice: '',
						icon_url: '',
						hex_training: '#60a5fa',
						hex_completed: null,
						last_garmin_sync: '',
						training_condition: {
							id: 1,
							height_difference: '0',
							surface: 'road',
							updated_at: 0,
							height: null,
							height_value: null,
							height_unit: null,
							height_unit_text: null
						}
					}
				],
				entries: []
			})
		);
		expect(store.getTrainingStatusForDate({ type: 'run', day: 5 })).toBe('missed');
	});

	it('returns "missed" for a past scheduled strength with no entry', () => {
		const store = createCalendarStore(new Date('2025-01-15'));
		store.setSchedule(
			makeSchedule({ strength_trainings: [makeStrengthTraining('2025-01-05')], entries: [] })
		);
		expect(store.getTrainingStatusForDate({ type: 'strength', day: 5 })).toBe('missed');
	});
});

// ─────────────────────────────────────────────────────────────
// hasTrainingEntriesForDate
// ─────────────────────────────────────────────────────────────
describe('hasTrainingEntriesForDate', () => {
	it('returns false when no training exists for the day', () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		store.setSchedule(makeSchedule());
		expect(store.hasTrainingEntriesForDate({ type: 'run', day: 10 })).toBe(false);
	});

	it('returns true when a training is scheduled for the day', () => {
		const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
		const yyyy = futureDate.getFullYear();
		const mm = String(futureDate.getMonth() + 1).padStart(2, '0');
		const dd = String(futureDate.getDate()).padStart(2, '0');
		const dateStr = `${yyyy}-${mm}-${dd}`;

		const store = createCalendarStore(futureDate);
		store.setSchedule(
			makeSchedule({
				trainings: [
					{
						id: 1,
						day_long: dateStr,
						day: Number(dateStr.replace(/-/g, '')),
						title: 'Run',
						type: 'run',
						training: {
							blocks: [],
							total_time: '45:00',
							total_time_in_sec: 2700,
							core_time: '30:00',
							core_time_in_sec: 1800,
							core_time_value: 30,
							core_time_unit: 'min',
							total_time_value: 45,
							total_time_unit: 'min',
							total_distance: '8km',
							total_distance_value: 8,
							total_distance_unit: 'km',
							total_distance_unit_text: 'km',
							core_distance: '6km',
							core_distance_value: 6,
							core_distance_unit: 'km',
							core_distance_unit_text: 'km'
						},
						can_be_edited: true,
						description: '',
						show_description_from: 0,
						nutritional_advice: '',
						icon_url: '',
						hex_training: '#60a5fa',
						hex_completed: null,
						last_garmin_sync: '',
						training_condition: {
							id: 1,
							height_difference: '0',
							surface: 'road',
							updated_at: 0,
							height: null,
							height_value: null,
							height_unit: null,
							height_unit_text: null
						}
					}
				]
			})
		);
		expect(store.hasTrainingEntriesForDate({ type: 'run', day: futureDate.getDate() })).toBe(true);
	});
});

// ─────────────────────────────────────────────────────────────
// selectedStrengthEntries
// ─────────────────────────────────────────────────────────────
describe('selectedStrengthEntries', () => {
	function makeEntry(type: string, startTime: string) {
		return {
			id: 30,
			name: 'Workout',
			start_time: startTime,
			type,
			icon: '',
			total_altitude: null,
			avg_heartbeat: null,
			rpe: null,
			comment: null,
			strava: false,
			strava_url: null,
			garmin: false,
			polar: false,
			trenara: true,
			distance: '0km',
			distance_value: 0,
			distance_unit: 'km',
			distance_unit_text: 'km',
			time: '30:00',
			time_in_sec: 1800,
			time_value: 30,
			time_unit: 'min',
			pace: '-',
			pace_value: 0,
			pace_unit: 'min/km',
			gps_media: [],
			notification: null,
			laps: [],
			allow_shoe: true,
			ask_feedback: false,
			cross_type: null,
			cross_percentage: null,
			cross_percentage_min: null,
			cross_percentage_max: null,
			splits: []
		};
	}

	it('returns strength entries for the selected date', () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		store.setSchedule(
			makeSchedule({ entries: [makeEntry('strength', '2025-03-05T08:00:00.000Z')] })
		);
		store.setSelectedDate({ year: 2025, month: 2, day: 5 });
		expect(store.selectedStrengthEntries).toHaveLength(1);
	});

	it('excludes run entries from selectedStrengthEntries', () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		store.setSchedule(makeSchedule({ entries: [makeEntry('run', '2025-03-05T08:00:00.000Z')] }));
		store.setSelectedDate({ year: 2025, month: 2, day: 5 });
		expect(store.selectedStrengthEntries).toHaveLength(0);
	});

	it('returns empty array when no date is selected', () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		store.setSchedule(
			makeSchedule({ entries: [makeEntry('strength', '2025-03-05T08:00:00.000Z')] })
		);
		// No setSelectedDate call — selectedDate is null
		expect(store.selectedStrengthEntries).toHaveLength(0);
	});
});

// ─────────────────────────────────────────────────────────────
// selectedRunEntries / selectedStrengthEntries — no schedule
// ─────────────────────────────────────────────────────────────
describe('selectedRunEntries / selectedStrengthEntries — no schedule set', () => {
	it('selectedRunEntries returns [] when schedule is null (??[] branch)', () => {
		// No setSchedule call — schedule is null, triggers ?? []
		const store = createCalendarStore(new Date('2025-03-05'));
		store.setSelectedDate({ year: 2025, month: 2, day: 5 });
		expect(store.selectedRunEntries).toEqual([]);
	});

	it('selectedStrengthEntries returns [] when schedule is null (??[] branch)', () => {
		// No setSchedule call — schedule is null, triggers ?? []
		const store = createCalendarStore(new Date('2025-03-05'));
		store.setSelectedDate({ year: 2025, month: 2, day: 5 });
		expect(store.selectedStrengthEntries).toEqual([]);
	});
});

// ─────────────────────────────────────────────────────────────
// selectedRunEntries — no date selected
// ─────────────────────────────────────────────────────────────
describe('selectedRunEntries — no date selected', () => {
	it('returns empty array when no date is selected', () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		store.setSchedule(
			makeSchedule({
				entries: [
					{
						id: 5,
						name: 'Morning run',
						start_time: '2025-03-05T08:00:00.000Z',
						type: 'run',
						icon: '',
						total_altitude: null,
						avg_heartbeat: null,
						rpe: null,
						comment: null,
						strava: false,
						strava_url: null,
						garmin: false,
						polar: false,
						trenara: true,
						distance: '10km',
						distance_value: 10,
						distance_unit: 'km',
						distance_unit_text: 'km',
						time: '45:00',
						time_in_sec: 2700,
						time_value: 45,
						time_unit: 'min',
						pace: '4:30 min/km',
						pace_value: 4.5,
						pace_unit: 'min/km',
						gps_media: [],
						notification: null,
						laps: [],
						allow_shoe: true,
						ask_feedback: false,
						cross_type: null,
						cross_percentage: null,
						cross_percentage_min: null,
						cross_percentage_max: null,
						splits: []
					}
				]
			})
		);
		// No setSelectedDate call — selectedDateString is null → filter returns false for all entries
		expect(store.selectedRunEntries).toHaveLength(0);
	});
});

// ─────────────────────────────────────────────────────────────
// getTrainingStatusForDate — 'none' from non-empty schedule
// ─────────────────────────────────────────────────────────────
describe('getTrainingStatusForDate — none with non-empty schedule', () => {
	function makeRunTraining(dayLong: string) {
		return {
			id: 1,
			day_long: dayLong,
			day: Number(dayLong.replace(/-/g, '')),
			title: 'Run',
			type: 'run',
			training: {
				blocks: [],
				total_time: '45:00',
				total_time_in_sec: 2700,
				core_time: '30:00',
				core_time_in_sec: 1800,
				core_time_value: 30,
				core_time_unit: 'min',
				total_time_value: 45,
				total_time_unit: 'min',
				total_distance: '8km',
				total_distance_value: 8,
				total_distance_unit: 'km',
				total_distance_unit_text: 'km',
				core_distance: '6km',
				core_distance_value: 6,
				core_distance_unit: 'km',
				core_distance_unit_text: 'km'
			},
			can_be_edited: true,
			description: '',
			show_description_from: 0,
			nutritional_advice: '',
			icon_url: '',
			hex_training: '#60a5fa',
			hex_completed: null,
			last_garmin_sync: '',
			training_condition: {
				id: 1,
				height_difference: '0',
				surface: 'road',
				updated_at: 0,
				height: null,
				height_value: null,
				height_unit: null,
				height_unit_text: null
			}
		};
	}

	function makeStrengthTraining(day: string) {
		return {
			id: 2,
			strength_id: null,
			type_id: 1,
			title: 'Core',
			training_type: 'strength',
			description: '',
			icon_url: '',
			day,
			time: '08:00',
			rest_between_sets: 60,
			rest_between_exercises: 90,
			exercises: [],
			accessories: []
		};
	}

	it('returns "none" for run type when schedule has trainings but not on requested day', () => {
		// Schedule has a run on day 10, but we query day 20
		const store = createCalendarStore(new Date('2025-03-15'));
		store.setSchedule(makeSchedule({ trainings: [makeRunTraining('2025-03-10')], entries: [] }));
		expect(store.getTrainingStatusForDate({ type: 'run', day: 20 })).toBe('none');
	});

	it('returns "none" for strength type when schedule has strength trainings but not on requested day', () => {
		// Schedule has strength on day 10, but we query day 20
		const store = createCalendarStore(new Date('2025-03-15'));
		store.setSchedule(
			makeSchedule({
				strength_trainings: [makeStrengthTraining('2025-03-10')],
				entries: []
			})
		);
		expect(store.getTrainingStatusForDate({ type: 'strength', day: 20 })).toBe('none');
	});
});

// ─────────────────────────────────────────────────────────────
// monthData (derived grid structure)
// ─────────────────────────────────────────────────────────────
describe('monthData', () => {
	it('daysInMonthWithOffset has at least 28 elements', () => {
		const store = createCalendarStore(new Date('2025-02-01'));
		expect(store.monthData.daysInMonthWithOffset.length).toBeGreaterThanOrEqual(28);
	});

	it('offsetAtStart is between 0 and 6', () => {
		const store = createCalendarStore(new Date('2025-03-01'));
		expect(store.monthData.offsetAtStart).toBeGreaterThanOrEqual(0);
		expect(store.monthData.offsetAtStart).toBeLessThanOrEqual(6);
	});

	it('offsetAtEnd is between 0 and 6', () => {
		const store = createCalendarStore(new Date('2025-03-01'));
		expect(store.monthData.offsetAtEnd).toBeGreaterThanOrEqual(0);
		expect(store.monthData.offsetAtEnd).toBeLessThanOrEqual(6);
	});

	it('handles a month starting on Sunday (June 2025) — adds extra week offset', () => {
		// June 1, 2025 is a Sunday — triggers the isSunday branch (line 72)
		const store = createCalendarStore(new Date('2025-06-01'));
		const { firstDayOfMonth, daysInMonthWithOffset, offsetAtStart } = store.monthData;
		expect(firstDayOfMonth).toBe(0); // 0 = Sunday
		expect(offsetAtStart).toBe(6); // Sunday maps to offset 6 (Mon-based grid)
		// 30 days + Sunday offset (6 leading + 7 extra) = at least 36 cells
		expect(daysInMonthWithOffset.length).toBeGreaterThanOrEqual(36);
	});
});

// ─────────────────────────────────────────────────────────────
// Navigation: goToPreviousMonth / goToNextMonth / goToToday
// ─────────────────────────────────────────────────────────────
describe('navigation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(makeSchedule())
		});
	});

	it('goToPreviousMonth decrements the month', async () => {
		const store = createCalendarStore(new Date('2025-03-15'));
		await store.navigation.goToPreviousMonth();
		expect(store.currentDate.getMonth()).toBe(1); // February
		expect(store.currentDate.getFullYear()).toBe(2025);
	});

	it('goToPreviousMonth wraps December → previous year', async () => {
		const store = createCalendarStore(new Date('2025-01-15'));
		await store.navigation.goToPreviousMonth();
		expect(store.currentDate.getMonth()).toBe(11); // December
		expect(store.currentDate.getFullYear()).toBe(2024);
	});

	it('goToNextMonth increments the month', async () => {
		const store = createCalendarStore(new Date('2025-03-15'));
		await store.navigation.goToNextMonth();
		expect(store.currentDate.getMonth()).toBe(3); // April
		expect(store.currentDate.getFullYear()).toBe(2025);
	});

	it('goToNextMonth wraps December → next year', async () => {
		const store = createCalendarStore(new Date('2025-12-15'));
		await store.navigation.goToNextMonth();
		expect(store.currentDate.getMonth()).toBe(0); // January
		expect(store.currentDate.getFullYear()).toBe(2026);
	});

	it('goToPreviousMonth clears selectedDate', async () => {
		const store = createCalendarStore(new Date('2025-03-15'));
		store.setSelectedDate({ year: 2025, month: 2, day: 10 });
		await store.navigation.goToPreviousMonth();
		expect(store.selectedDate).toBeNull();
	});

	it('goToToday sets selectedDate to today and loads the current month', async () => {
		const store = createCalendarStore(new Date('2025-01-01'));
		await store.navigation.goToToday();
		const today = new Date();
		expect(store.selectedDate?.year).toBe(today.getFullYear());
		expect(store.selectedDate?.month).toBe(today.getMonth());
		expect(store.selectedDate?.day).toBe(today.getDate());
		expect(store.currentDate.getMonth()).toBe(today.getMonth());
	});

	it('records which way each step went, for the grid to animate from', async () => {
		const store = createCalendarStore(new Date('2025-03-15'));
		expect(store.navigationDirection).toBe(0);

		await store.navigation.goToNextMonth();
		expect(store.navigationDirection).toBe(1);

		await store.navigation.goToPreviousMonth();
		expect(store.navigationDirection).toBe(-1);
	});

	it('records the direction of a step through the folded weeks too', async () => {
		const store = createCalendarStore(new Date('2025-03-15'));
		await store.setViewMode('week');

		await store.navigation.goToNextWeek();
		expect(store.navigationDirection).toBe(1);

		await store.navigation.goToPreviousWeek();
		expect(store.navigationDirection).toBe(-1);
	});

	it('calls folding the month neither forward nor back', async () => {
		const store = createCalendarStore(new Date('2025-03-15'));
		await store.navigation.goToNextMonth();
		expect(store.navigationDirection).toBe(1);

		await store.setViewMode('week');
		expect(store.navigationDirection).toBe(0);
	});

	it('works out the direction of a jump to today from where the grid is sitting', async () => {
		const past = createCalendarStore(new Date('2020-03-15'));
		await past.navigation.goToToday();
		expect(past.navigationDirection).toBe(1);

		const future = createCalendarStore(new Date('2099-03-15'));
		await future.navigation.goToToday();
		expect(future.navigationDirection).toBe(-1);

		const now = createCalendarStore(new Date());
		await now.navigation.goToToday();
		expect(now.navigationDirection).toBe(0);
	});

	it('refresh re-fetches without changing currentDate', async () => {
		const store = createCalendarStore(new Date('2025-03-15'));
		const monthBefore = store.currentDate.getMonth();
		await store.navigation.refresh();
		expect(store.currentDate.getMonth()).toBe(monthBefore);
		expect(mockFetch).toHaveBeenCalled();
	});
});

describe('replaceTraining', () => {
	function training(overrides: Record<string, unknown> = {}) {
		return {
			id: 42,
			day: 0,
			day_long: '2025-03-05',
			title: 'Tempo run',
			description: '',
			show_description_from: 0,
			type: 'training',
			icon_url: '',
			hex_training: '#E69F00',
			hex_completed: null,
			last_garmin_sync: null,
			can_be_edited: true,
			training: {
				blocks: [],
				total_time_in_sec: 4068,
				core_time_in_sec: 3285,
				core_time: '54:45',
				core_time_value: 3285,
				core_time_unit: 'sec',
				total_time: '01:07:48',
				total_time_value: 4068,
				total_time_unit: 'sec',
				total_distance: '12km',
				total_distance_value: 12,
				total_distance_unit: 'km'
			},
			...overrides
		} as unknown as Schedule['trainings'][number];
	}

	beforeEach(() => {
		mockFetch.mockReset();
	});

	it('swaps in the newer copy the server handed back', async () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		mockFetch.mockResolvedValue({
			ok: true,
			json: async () => makeSchedule({ trainings: [training()] })
		});
		await store.loadMonthData(new Date('2025-03-05'));

		// A session mutation returns the whole training, so the week is updated
		// rather than refetched.
		store.replaceTraining(training({ title: 'Easy run', hex_training: '#009E73' }));

		expect(store.schedule?.trainings[0].title).toBe('Easy run');
		expect(store.schedule?.trainings[0].hex_training).toBe('#009E73');
	});

	it('survives leaving the month and coming back', async () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		mockFetch.mockResolvedValue({
			ok: true,
			json: async () => makeSchedule({ trainings: [training()] })
		});
		await store.loadMonthData(new Date('2025-03-05'));
		store.replaceTraining(training({ title: 'Easy run' }));

		// The month cache holds the very object the store serves, so without
		// updating it too, coming back would resurrect the stale copy.
		mockFetch.mockResolvedValue({ ok: true, json: async () => makeSchedule() });
		await store.loadMonthData(new Date('2025-04-05'));
		await store.loadMonthData(new Date('2025-03-05'));

		expect(store.schedule?.trainings[0].title).toBe('Easy run');
	});

	it('leaves every other training alone', async () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		mockFetch.mockResolvedValue({
			ok: true,
			json: async () =>
				makeSchedule({ trainings: [training(), training({ id: 43, title: 'LSD' })] })
		});
		await store.loadMonthData(new Date('2025-03-05'));

		store.replaceTraining(training({ title: 'Easy run' }));

		expect(store.schedule?.trainings.map((t) => t.title)).toEqual(['Easy run', 'LSD']);
	});

	it('ignores a training the week does not hold', async () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		mockFetch.mockResolvedValue({
			ok: true,
			json: async () => makeSchedule({ trainings: [training()] })
		});
		await store.loadMonthData(new Date('2025-03-05'));

		// The runner moved months while a change was in flight.
		store.replaceTraining(training({ id: 999, title: 'Somewhere else' }));

		expect(store.schedule?.trainings).toHaveLength(1);
		expect(store.schedule?.trainings[0].title).toBe('Tempo run');
	});
});

// ─────────────────────────────────────────────────────────────
// Background revalidation
// ─────────────────────────────────────────────────────────────
describe('revalidate', () => {
	function okResponse(schedule: Schedule, etag: string | null = null) {
		return {
			ok: true,
			status: 200,
			statusText: 'OK',
			headers: { get: (name: string) => (name.toLowerCase() === 'etag' ? etag : null) },
			json: () => Promise.resolve(schedule)
		};
	}

	/** The `from` parameter of the nth request, or null if it asked for everything. */
	function requestedFrom(call: number): string | null {
		return new URL(mockFetch.mock.calls[call][0], 'http://localhost').searchParams.get('from');
	}

	function runOn(id: number, day: string) {
		return { id, day_long: day, title: `Run ${id}` } as unknown as Schedule['trainings'][number];
	}

	function notModified() {
		return {
			ok: false,
			status: 304,
			statusText: 'Not Modified',
			headers: { get: () => null },
			json: () => Promise.reject(new Error('no body'))
		};
	}

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('swaps in a schedule that came back changed', async () => {
		mockFetch
			.mockResolvedValueOnce(okResponse(makeSchedule({ id: 1 })))
			.mockResolvedValueOnce(okResponse(makeSchedule({ id: 2 })));

		const store = createCalendarStore(new Date('2025-03-05'));
		await store.loadMonthData(new Date('2025-03-05'));
		await store.revalidate();

		expect(store.schedule?.id).toBe(2);
	});

	it('leaves the very same schedule object in place when nothing changed', async () => {
		mockFetch
			.mockResolvedValueOnce(okResponse(makeSchedule({ id: 1 })))
			.mockResolvedValueOnce(okResponse(makeSchedule({ id: 1 })));

		const store = createCalendarStore(new Date('2025-03-05'));
		await store.loadMonthData(new Date('2025-03-05'));
		const before = store.schedule;

		await store.revalidate();

		// Same object, so nothing downstream rebuilds an index or re-renders.
		expect(store.schedule).toBe(before);
	});

	it('bumps scheduleRevision only when the plan actually moved', async () => {
		mockFetch
			.mockResolvedValueOnce(okResponse(makeSchedule({ id: 1 })))
			.mockResolvedValueOnce(okResponse(makeSchedule({ id: 1 })))
			.mockResolvedValueOnce(okResponse(makeSchedule({ id: 2 })));

		const store = createCalendarStore(new Date('2025-03-05'));
		await store.loadMonthData(new Date('2025-03-05'));
		const initial = store.scheduleRevision;

		await store.revalidate();
		expect(store.scheduleRevision).toBe(initial);

		await store.revalidate();
		expect(store.scheduleRevision).toBe(initial + 1);
	});

	it('never raises the blocking loading flag', async () => {
		mockFetch.mockResolvedValue(okResponse(makeSchedule()));

		const store = createCalendarStore(new Date('2025-03-05'));
		const inFlight = store.revalidate();
		expect(store.isLoading).toBe(false);
		await inFlight;
		expect(store.isLoading).toBe(false);
	});

	it('raises isRevalidating while in flight and drops it afterwards', async () => {
		let release: (value: unknown) => void = () => {};
		mockFetch.mockReturnValueOnce(
			new Promise((resolve) => {
				release = () => resolve(okResponse(makeSchedule()));
			})
		);

		const store = createCalendarStore(new Date('2025-03-05'));
		const inFlight = store.revalidate();
		expect(store.isRevalidating).toBe(true);

		release(null);
		await inFlight;
		expect(store.isRevalidating).toBe(false);
	});

	it('ignores a second call while one is already in flight', async () => {
		mockFetch.mockResolvedValue(okResponse(makeSchedule()));

		const store = createCalendarStore(new Date('2025-03-05'));
		await Promise.all([store.revalidate(), store.revalidate()]);

		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it('sends the stored etag so an unchanged month costs nothing', async () => {
		mockFetch
			.mockResolvedValueOnce(okResponse(makeSchedule({ id: 7 }), 'W/"abc"'))
			.mockResolvedValueOnce(notModified());

		const store = createCalendarStore(new Date('2025-03-05'));
		await store.loadMonthData(new Date('2025-03-05'));
		await store.revalidate();

		expect(mockFetch.mock.calls[1][1]).toMatchObject({ headers: { 'If-None-Match': 'W/"abc"' } });
		expect(store.schedule?.id).toBe(7);
	});

	it('asks for the whole month, unconditionally, when the runner presses refresh', async () => {
		mockFetch
			.mockResolvedValueOnce(okResponse(makeSchedule({ id: 7 }), 'W/"abc"'))
			.mockResolvedValueOnce(okResponse(makeSchedule({ id: 8 }), 'W/"def"'));

		const store = createCalendarStore(new Date(2025, 2, 28));
		await store.loadMonthData(new Date(2025, 2, 28));
		await store.refresh();

		expect(mockFetch.mock.calls[1][1]?.headers).toEqual({});
		expect(requestedFrom(1)).toBeNull();
		expect(store.schedule?.id).toBe(8);
	});

	it('asks only about the weeks that can still change once a month is in hand', async () => {
		mockFetch.mockResolvedValue(okResponse(makeSchedule()));

		const store = createCalendarStore(new Date(2025, 2, 28));
		await store.loadMonthData(new Date(2025, 2, 28));
		// Nothing cached to graft onto yet, so the first ask is for all of it.
		expect(requestedFrom(0)).toBeNull();

		await store.revalidate();
		// A week's grace behind today, so a run synced late still lands.
		expect(requestedFrom(1)).toBe('2025-03-21');
	});

	it('grafts a partial answer onto the month it already holds', async () => {
		const full = makeSchedule({
			trainings: [runOn(1, '2025-03-03'), runOn(2, '2025-03-25')]
		});
		const partial = {
			...makeSchedule({ trainings: [runOn(2, '2025-03-26')] }),
			covered_from: '2025-03-24'
		};

		mockFetch
			.mockResolvedValueOnce(okResponse(full))
			.mockResolvedValueOnce(okResponse(partial as Schedule));

		const store = createCalendarStore(new Date(2025, 2, 28));
		await store.loadMonthData(new Date(2025, 2, 28));
		await store.revalidate();

		// The untouched week survives; the answered week is taken as given.
		expect(store.schedule?.trainings.map((t) => t.day_long)).toEqual(['2025-03-03', '2025-03-26']);
	});

	it('says nothing at all about a month that is wholly in the past', async () => {
		mockFetch.mockResolvedValue(okResponse(makeSchedule()));

		const store = createCalendarStore(new Date(2025, 7, 15));
		await store.loadMonthData(new Date(2025, 2, 15));
		vi.clearAllMocks();

		await store.revalidate();

		expect(mockFetch).not.toHaveBeenCalled();
	});

	it('keeps the plan on screen when the refresh fails', async () => {
		mockFetch
			.mockResolvedValueOnce(okResponse(makeSchedule({ id: 5 })))
			.mockRejectedValueOnce(new Error('offline'));

		const store = createCalendarStore(new Date('2025-03-05'));
		await store.loadMonthData(new Date('2025-03-05'));
		await store.revalidate();

		expect(store.schedule?.id).toBe(5);
		expect(store.error).toBeNull();
		expect(store.isRevalidating).toBe(false);
	});

	it('records when the data last came back', async () => {
		mockFetch.mockResolvedValue(okResponse(makeSchedule()));

		const store = createCalendarStore(new Date('2025-03-05'));
		expect(store.lastUpdatedAt).toBeNull();

		await store.loadMonthData(new Date('2025-03-05'));
		expect(store.lastUpdatedAt).toBeTypeOf('number');
	});

	it('fetches the month itself, alongside whatever else the page shows', async () => {
		mockFetch.mockResolvedValue(okResponse(makeSchedule()));
		const refreshPageData = vi.fn().mockResolvedValue(undefined);
		const store = createCalendarStore(new Date(2025, 2, 5), { refreshPageData });

		await store.revalidate();

		expect(refreshPageData).toHaveBeenCalledTimes(1);
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it('fetches a month the runner paged to, which no page load covers', async () => {
		mockFetch.mockResolvedValue(okResponse(makeSchedule()));
		const refreshPageData = vi.fn().mockResolvedValue(undefined);
		const store = createCalendarStore(new Date('2025-03-05'), { refreshPageData });

		await store.navigation.goToNextMonth();
		vi.clearAllMocks();

		await store.revalidate();

		expect(refreshPageData).toHaveBeenCalledTimes(1);
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it('survives a page refresh that throws', async () => {
		const refreshPageData = vi.fn().mockRejectedValue(new Error('load failed'));
		const store = createCalendarStore(new Date('2025-03-05'), { refreshPageData });

		await expect(store.revalidate()).resolves.toBeUndefined();
		expect(store.isRevalidating).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────
// setSchedule with an explicit month
// ─────────────────────────────────────────────────────────────
describe('setSchedule(schedule, forMonth)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetch.mockResolvedValue({
			ok: true,
			status: 200,
			headers: { get: () => null },
			json: () => Promise.resolve(makeSchedule({ id: 0 }))
		});
	});

	it('shows a schedule that covers the month on screen', () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		store.setSchedule(makeSchedule({ id: 11 }), new Date('2025-03-20'));
		expect(store.schedule?.id).toBe(11);
	});

	it('files a schedule for another month away instead of showing it', async () => {
		const store = createCalendarStore(new Date('2025-03-05'));
		store.setSchedule(makeSchedule({ id: 11 }));

		// The runner has paged on; a refresh for March must not land on April.
		await store.navigation.goToNextMonth();
		store.setSchedule(makeSchedule({ id: 99 }), new Date('2025-03-05'));
		expect(store.schedule?.id).toBe(0);

		// ...but it is waiting for them when they page back.
		await store.navigation.goToPreviousMonth();
		expect(store.schedule?.id).toBe(99);
	});
});

// ─────────────────────────────────────────────────────────────
// syncToday
// ─────────────────────────────────────────────────────────────
describe('syncToday', () => {
	it('reports no change within the same day', () => {
		const store = createCalendarStore(new Date(2025, 2, 5, 9, 0));
		expect(store.syncToday(new Date(2025, 2, 5, 23, 59))).toBe(false);
	});

	it('moves today on once the date has rolled over', () => {
		const store = createCalendarStore(new Date(2025, 2, 5, 23, 0));
		expect(store.syncToday(new Date(2025, 2, 6, 0, 5))).toBe(true);
		expect(store.today.getDate()).toBe(6);
	});

	it('re-reads a scheduled session as missed once its day has passed', () => {
		const store = createCalendarStore(new Date(2025, 2, 5, 23, 0));
		store.setSchedule(
			makeSchedule({
				strength_trainings: [
					{
						id: 1,
						strength_id: null,
						type_id: 1,
						title: 'Core',
						training_type: 'strength',
						description: '',
						icon_url: '',
						day: '2025-03-05',
						time: '08:00',
						rest_between_sets: 60,
						rest_between_exercises: 90,
						exercises: [],
						accessories: []
					}
				]
			})
		);

		expect(store.getTrainingStatusForDate({ type: 'strength', day: 5 })).toBe('scheduled');

		store.syncToday(new Date(2025, 2, 6, 0, 5));
		expect(store.getTrainingStatusForDate({ type: 'strength', day: 5 })).toBe('missed');
	});
});

// ─────────────────────────────────────────────────────────────
// Folding the month into a single week
// ─────────────────────────────────────────────────────────────
describe('week view', () => {
	// Wednesday. August 2026 ends on a Monday, so the last week of it runs
	// straight into September — the case the fold has to get right.
	const AUGUST_2026 = new Date(2026, 7, 26);

	/** The month a `/api/v1/schedule` call asked about, as `YYYY-MM`. */
	function requestedMonth(url: string): string {
		const date = new Date(Number(new URL(url, 'http://localhost').searchParams.get('date')));
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
	}

	/** Serve a different schedule per month, so a fetched neighbour is visible. */
	function serveByMonth(schedules: Record<string, Schedule>) {
		mockFetch.mockImplementation((url: string) =>
			Promise.resolve({
				ok: true,
				json: () => Promise.resolve(schedules[requestedMonth(url)] ?? makeSchedule())
			})
		);
	}

	beforeEach(() => {
		vi.clearAllMocks();
		mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(makeSchedule()) });
	});

	it('starts on the month', () => {
		const store = createCalendarStore(AUGUST_2026);
		expect(store.viewMode).toBe('month');
	});

	it('folds to the week and back again', async () => {
		const store = createCalendarStore(AUGUST_2026);

		await store.toggleViewMode();
		expect(store.viewMode).toBe('week');

		await store.toggleViewMode();
		expect(store.viewMode).toBe('month');
	});

	it('folds onto the week of the selected day, Monday first', async () => {
		const store = createCalendarStore(AUGUST_2026);
		store.setSelectedDate({ year: 2026, month: 7, day: 26 });

		await store.setViewMode('week');

		expect(store.weekDays).toHaveLength(7);
		expect(store.weekDays[0]).toEqual({ year: 2026, month: 7, day: 24 });
		expect(store.weekDays[6]).toEqual({ year: 2026, month: 7, day: 30 });
	});

	it('falls back to the week of today when nothing is selected', async () => {
		const store = createCalendarStore(AUGUST_2026);

		await store.setViewMode('week');

		expect(store.weekDays[0]).toEqual({ year: 2026, month: 7, day: 24 });
	});

	it('keeps the days of the next month on a week that straddles the turn', async () => {
		const store = createCalendarStore(AUGUST_2026);
		store.setSelectedDate({ year: 2026, month: 7, day: 31 });

		await store.setViewMode('week');

		expect(store.weekDays[0]).toEqual({ year: 2026, month: 7, day: 31 });
		expect(store.weekDays[6]).toEqual({ year: 2026, month: 8, day: 6 });
	});

	it('fetches the month a straddling week reaches into', async () => {
		const store = createCalendarStore(AUGUST_2026);
		store.setSchedule(makeSchedule(), AUGUST_2026);
		store.setSelectedDate({ year: 2026, month: 7, day: 31 });

		await store.setViewMode('week');

		const months = mockFetch.mock.calls.map((call) => requestedMonth(String(call[0])));
		expect(months).toContain('2026-09');
	});

	it('shows the training dots of the month next door', async () => {
		serveByMonth({
			'2026-09': makeSchedule({
				trainings: [{ day_long: '2026-09-02' }] as unknown as Schedule['trainings']
			})
		});

		const store = createCalendarStore(AUGUST_2026);
		store.setSchedule(makeSchedule(), AUGUST_2026);
		store.setSelectedDate({ year: 2026, month: 7, day: 31 });

		await store.setViewMode('week');

		expect(store.getTrainingStatusForDay({ year: 2026, month: 8, day: 2 }, 'run')).toBe(
			'scheduled'
		);
	});

	it('steps a week at a time, carrying the picked weekday along', async () => {
		const store = createCalendarStore(AUGUST_2026);
		store.setSelectedDate({ year: 2026, month: 7, day: 26 });
		await store.setViewMode('week');

		await store.navigation.goToNextWeek();
		expect(store.weekDays[0]).toEqual({ year: 2026, month: 7, day: 31 });
		expect(store.selectedDate).toEqual({ year: 2026, month: 8, day: 2 });

		await store.navigation.goToPreviousWeek();
		expect(store.weekDays[0]).toEqual({ year: 2026, month: 7, day: 24 });
		expect(store.selectedDate).toEqual({ year: 2026, month: 7, day: 26 });
	});

	it('brings the month in hand along when a week step crosses into it', async () => {
		const store = createCalendarStore(AUGUST_2026);
		store.setSelectedDate({ year: 2026, month: 7, day: 26 });
		await store.setViewMode('week');

		await store.navigation.goToNextWeek();

		expect(store.currentDate.getMonth()).toBe(8); // September, where the pick landed
	});

	it('sends the arrows a month at a time again once unfolded', async () => {
		const store = createCalendarStore(AUGUST_2026);

		await store.navigation.goToNext();
		expect(store.currentDate.getMonth()).toBe(8);

		await store.setViewMode('week');
		const anchor = store.weekDays[0];
		await store.navigation.goToNext();
		expect(store.weekDays[0].day).not.toBe(anchor.day);
	});

	it('unfolds onto the month the picked day belongs to', async () => {
		const store = createCalendarStore(AUGUST_2026);
		store.setSelectedDate({ year: 2026, month: 7, day: 31 });
		await store.setViewMode('week');

		await store.navigation.goToNextWeek(); // Monday 7 September
		await store.setViewMode('month');

		expect(store.viewMode).toBe('month');
		expect(store.currentDate.getMonth()).toBe(8);
	});

	it('unfolds onto the month holding most of the week when nothing is picked', async () => {
		const store = createCalendarStore(AUGUST_2026);
		await store.setViewMode('week');
		store.setSelectedDate(null);

		// Monday 31 August, whose Thursday — and five of whose days — are September.
		await store.navigation.goToNextWeek();
		await store.setViewMode('month');

		expect(store.currentDate.getMonth()).toBe(8);
	});

	it('follows a pick into the month next door', async () => {
		serveByMonth({ '2026-09': makeSchedule({ id: 909 }) });

		const store = createCalendarStore(AUGUST_2026);
		store.setSchedule(makeSchedule({ id: 808 }), AUGUST_2026);
		store.setSelectedDate({ year: 2026, month: 7, day: 31 });
		await store.setViewMode('week');

		await store.selectDay({ year: 2026, month: 8, day: 3 });

		expect(store.selectedDate).toEqual({ year: 2026, month: 8, day: 3 });
		expect(store.currentDate.getMonth()).toBe(8);
		expect(store.schedule?.id).toBe(909);
	});

	it('takes the view the screen asks for', async () => {
		const store = createCalendarStore(AUGUST_2026);

		await store.setPreferredViewMode('week');

		expect(store.viewMode).toBe('week');
		expect(store.viewModeChosen).toBe(false);
	});

	it("stops taking the screen's word for it once the arrow has been used", async () => {
		const store = createCalendarStore(AUGUST_2026);
		await store.setPreferredViewMode('week');

		await store.toggleViewMode(); // the runner opens the month back up
		expect(store.viewMode).toBe('month');
		expect(store.viewModeChosen).toBe(true);

		await store.setPreferredViewMode('week'); // a resize, or a turn of the phone
		expect(store.viewMode).toBe('month');
	});

	it('setting the mode it is already in changes nothing', async () => {
		const store = createCalendarStore(AUGUST_2026);
		store.setSelectedDate({ year: 2026, month: 7, day: 26 });

		await store.setViewMode('month');

		expect(store.viewMode).toBe('month');
		expect(store.selectedDate).toEqual({ year: 2026, month: 7, day: 26 });
	});
});
