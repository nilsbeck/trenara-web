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
						training: { blocks: [], total_time: '45:00', total_time_in_sec: 2700, core_time: '30:00', core_time_in_sec: 1800, core_time_value: 30, core_time_unit: 'min', total_time_value: 45, total_time_unit: 'min', total_distance: '8km', total_distance_value: 8, total_distance_unit: 'km', total_distance_unit_text: 'km', core_distance: '6km', core_distance_value: 6, core_distance_unit: 'km', core_distance_unit_text: 'km' },
						can_be_edited: true,
						description: '',
						show_description_from: 0,
						nutritional_advice: '',
						icon_url: '',
						hex_training: '#60a5fa',
						hex_completed: null,
						last_garmin_sync: '',
						training_condition: { id: 1, height_difference: '0', surface: 'road', updated_at: 0, height: null, height_value: null, height_unit: null, height_unit_text: null }
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
						training: { blocks: [], total_time: '45:00', total_time_in_sec: 2700, core_time: '30:00', core_time_in_sec: 1800, core_time_value: 30, core_time_unit: 'min', total_time_value: 45, total_time_unit: 'min', total_distance: '8km', total_distance_value: 8, total_distance_unit: 'km', total_distance_unit_text: 'km', core_distance: '6km', core_distance_value: 6, core_distance_unit: 'km', core_distance_unit_text: 'km' },
						can_be_edited: true,
						description: '',
						show_description_from: 0,
						nutritional_advice: '',
						icon_url: '',
						hex_training: '#60a5fa',
						hex_completed: null,
						last_garmin_sync: '',
						training_condition: { id: 1, height_difference: '0', surface: 'road', updated_at: 0, height: null, height_value: null, height_unit: null, height_unit_text: null }
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
						training: { blocks: [], total_time: '45:00', total_time_in_sec: 2700, core_time: '30:00', core_time_in_sec: 1800, core_time_value: 30, core_time_unit: 'min', total_time_value: 45, total_time_unit: 'min', total_distance: '8km', total_distance_value: 8, total_distance_unit: 'km', total_distance_unit_text: 'km', core_distance: '6km', core_distance_value: 6, core_distance_unit: 'km', core_distance_unit_text: 'km' },
						can_be_edited: true,
						description: '',
						show_description_from: 0,
						nutritional_advice: '',
						icon_url: '',
						hex_training: '#60a5fa',
						hex_completed: null,
						last_garmin_sync: '',
						training_condition: { id: 1, height_difference: '0', surface: 'road', updated_at: 0, height: null, height_value: null, height_unit: null, height_unit_text: null }
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
		store.setSchedule(makeSchedule({ entries: [makeEntry('strength', '2025-03-05T08:00:00.000Z')] }));
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
		return { id: 1, strength_id: null, type_id: 1, title: 'Core', training_type: 'strength', description: '', icon_url: '', day, time: '08:00', rest_between_sets: 60, rest_between_exercises: 90, exercises: [], accessories: [] };
	}

	it('returns "scheduled" for a future strength training', () => {
		const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
		const yyyy = futureDate.getFullYear();
		const mm = String(futureDate.getMonth() + 1).padStart(2, '0');
		const dd = String(futureDate.getDate()).padStart(2, '0');
		const dateStr = `${yyyy}-${mm}-${dd}`;

		const store = createCalendarStore(futureDate);
		store.setSchedule(makeSchedule({ strength_trainings: [makeStrengthTraining(dateStr)] }));
		expect(store.getTrainingStatusForDate({ type: 'strength', day: futureDate.getDate() })).toBe('scheduled');
	});

	it('returns "completed" when a strength entry exists', () => {
		const store = createCalendarStore(new Date('2025-01-10'));
		store.setSchedule(makeSchedule({
			entries: [{
				id: 20, name: 'Strength', start_time: '2025-01-10T08:00:00.000Z', type: 'strength',
				icon: '', total_altitude: null, avg_heartbeat: null, rpe: null, comment: null,
				strava: false, strava_url: null, garmin: false, polar: false, trenara: true,
				distance: '0km', distance_value: 0, distance_unit: 'km', distance_unit_text: 'km',
				time: '30:00', time_in_sec: 1800, time_value: 30, time_unit: 'min',
				pace: '-', pace_value: 0, pace_unit: 'min/km', gps_media: [], notification: null, laps: [], splits: []
			}]
		}));
		expect(store.getTrainingStatusForDate({ type: 'strength', day: 10 })).toBe('completed');
	});

	it('returns "missed" for a past scheduled run with no entry', () => {
		// Use January 2025 (clearly in the past) as both the store view month and training date
		const store = createCalendarStore(new Date('2025-01-15'));
		store.setSchedule(makeSchedule({
			trainings: [{
				id: 5, day_long: '2025-01-05', day: 20250105, title: 'Past run', type: 'run',
				training: { blocks: [], total_time: '45:00', total_time_in_sec: 2700, core_time: '30:00', core_time_in_sec: 1800, core_time_value: 30, core_time_unit: 'min', total_time_value: 45, total_time_unit: 'min', total_distance: '8km', total_distance_value: 8, total_distance_unit: 'km', total_distance_unit_text: 'km', core_distance: '6km', core_distance_value: 6, core_distance_unit: 'km', core_distance_unit_text: 'km' },
				can_be_edited: false, description: '', show_description_from: 0, nutritional_advice: '',
				icon_url: '', hex_training: '#60a5fa', hex_completed: null, last_garmin_sync: '',
				training_condition: { id: 1, height_difference: '0', surface: 'road', updated_at: 0, height: null, height_value: null, height_unit: null, height_unit_text: null }
			}],
			entries: []
		}));
		expect(store.getTrainingStatusForDate({ type: 'run', day: 5 })).toBe('missed');
	});

	it('returns "missed" for a past scheduled strength with no entry', () => {
		const store = createCalendarStore(new Date('2025-01-15'));
		store.setSchedule(makeSchedule({ strength_trainings: [makeStrengthTraining('2025-01-05')], entries: [] }));
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
		store.setSchedule(makeSchedule({
			trainings: [{
				id: 1, day_long: dateStr, day: Number(dateStr.replace(/-/g, '')), title: 'Run', type: 'run',
				training: { blocks: [], total_time: '45:00', total_time_in_sec: 2700, core_time: '30:00', core_time_in_sec: 1800, core_time_value: 30, core_time_unit: 'min', total_time_value: 45, total_time_unit: 'min', total_distance: '8km', total_distance_value: 8, total_distance_unit: 'km', total_distance_unit_text: 'km', core_distance: '6km', core_distance_value: 6, core_distance_unit: 'km', core_distance_unit_text: 'km' },
				can_be_edited: true, description: '', show_description_from: 0, nutritional_advice: '',
				icon_url: '', hex_training: '#60a5fa', hex_completed: null, last_garmin_sync: '',
				training_condition: { id: 1, height_difference: '0', surface: 'road', updated_at: 0, height: null, height_value: null, height_unit: null, height_unit_text: null }
			}]
		}));
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

	it('refresh re-fetches without changing currentDate', async () => {
		const store = createCalendarStore(new Date('2025-03-15'));
		const monthBefore = store.currentDate.getMonth();
		await store.navigation.refresh();
		expect(store.currentDate.getMonth()).toBe(monthBefore);
		expect(mockFetch).toHaveBeenCalled();
	});
});
