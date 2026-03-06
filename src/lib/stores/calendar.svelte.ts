/**
 * Calendar store using Svelte 5 runes
 */

import type {
	Schedule,
	ScheduledTraining,
	StrengthTraining,
	Entry
} from '$lib/server/trenara/types';

export type CalendarDate = {
	year: number;
	month: number;
	day: number;
};

export type TrainingFilter = {
	type: 'run' | 'strength';
	day: number;
};

export type TrainingStatus = 'none' | 'scheduled' | 'completed' | 'missed';

export enum Tab {
	Training = 'training',
	Strength = 'strength',
	Nutrition = 'nutrition'
}

// ── Helpers (pure, no allocations on hot path) ──────────────

/** Extract YYYY-MM-DD from an ISO timestamp without creating a Date object. */
function isoToDateString(iso: string): string {
	return iso.slice(0, 10);
}

/** Extract YYYY-MM-DD from an entry start_time, handling timezone offset. */
function entryDateString(startTime: string): string {
	// start_time may be an ISO string like "2025-03-05T08:00:00.000Z"
	// We need local-date, so we go through Date for TZ correction.
	const d = new Date(startTime);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

/** Build a cache key from a Date (YYYY-MM). */
function monthKey(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// ── Status index type ───────────────────────────────────────

type StatusIndex = {
	scheduledRuns: Set<string>;
	completedRuns: Set<string>;
	scheduledStrength: Set<string>;
	completedStrength: Set<string>;
};

/** Build O(1) lookup sets from a schedule. Called once per schedule change. */
function buildStatusIndex(schedule: Schedule): StatusIndex {
	const scheduledRuns = new Set<string>();
	const completedRuns = new Set<string>();
	const scheduledStrength = new Set<string>();
	const completedStrength = new Set<string>();

	for (const t of schedule.trainings ?? []) {
		scheduledRuns.add(isoToDateString(t.day_long));
	}
	for (const s of schedule.strength_trainings ?? []) {
		scheduledStrength.add(isoToDateString(s.day));
	}
	for (const e of schedule.entries ?? []) {
		const d = entryDateString(e.start_time);
		if (e.type === 'run') {
			completedRuns.add(d);
		} else if (e.type === 'strength') {
			completedStrength.add(d);
		}
	}

	return { scheduledRuns, completedRuns, scheduledStrength, completedStrength };
}

// ── Entry date cache ────────────────────────────────────────

/** Pre-compute date strings for all entries so filters don't re-parse. */
function buildEntryDateCache(entries: Entry[]): Map<Entry, string> {
	const map = new Map<Entry, string>();
	for (const e of entries) {
		map.set(e, entryDateString(e.start_time));
	}
	return map;
}

// ─────────────────────────────────────────────────────────────

export function createCalendarStore(initialDate: Date) {
	// Core state
	let currentDate = $state(initialDate);
	let selectedDate = $state<CalendarDate | null>(null);
	let schedule = $state<Schedule | null>(null);
	let isLoading = $state(false);
	let error = $state<Error | null>(null);

	// ── Month schedule cache (avoids re-fetching visited months) ──
	const scheduleCache = new Map<string, Schedule>();

	// ── Pre-computed status index (rebuilt when schedule changes) ──
	const statusIndex = $derived<StatusIndex | null>(
		schedule ? buildStatusIndex(schedule) : null
	);

	// ── Pre-computed entry date cache ─────────────────────────────
	const entryDates = $derived<Map<Entry, string>>(
		buildEntryDateCache(schedule?.entries ?? [])
	);

	// Derived: selected date as formatted string
	const selectedDateString = $derived(
		selectedDate
			? `${selectedDate.year}-${String(selectedDate.month + 1).padStart(2, '0')}-${String(selectedDate.day).padStart(2, '0')}`
			: null
	);

	// Derived: filtered trainings for selected date
	const filteredTrainings = $derived(
		schedule?.trainings?.filter(
			(training: ScheduledTraining) => training.day_long === selectedDateString
		) ?? []
	);

	// Derived: filtered strength trainings for selected date
	const filteredStrengthTrainings = $derived(
		schedule?.strength_trainings?.filter(
			(training: StrengthTraining) => training.day === selectedDateString
		) ?? []
	);

	// Derived: month grid data
	const monthData = $derived.by(() => {
		const year = currentDate.getFullYear();
		const month = currentDate.getMonth();

		const firstDayOfMonth = new Date(year, month, 1).getDay();
		const isSunday = firstDayOfMonth === 0;
		const offsetAtStart = isSunday ? firstDayOfMonth + 6 : firstDayOfMonth - 1;

		let daysInCurrentMonthWithOffset =
			new Date(year, month + 1, 0).getDate() + firstDayOfMonth - 1;
		if (isSunday) {
			daysInCurrentMonthWithOffset += 7;
		}
		const offsetAtEnd = daysInCurrentMonthWithOffset % 7;

		const daysInMonthWithOffset = Array.from(
			{ length: daysInCurrentMonthWithOffset },
			(_, i) => i + 1
		);

		return {
			daysInMonthWithOffset,
			firstDayOfMonth,
			offsetAtStart,
			offsetAtEnd
		};
	});

	// Derived: entries filtered for selected date (run) — uses cached dates
	const selectedRunEntries = $derived(
		schedule?.entries?.filter((entry: Entry) => {
			if (!selectedDateString) return false;
			return entryDates.get(entry) === selectedDateString && entry.type === 'run';
		}) ?? []
	);

	// Derived: entries filtered for selected date (strength) — uses cached dates
	const selectedStrengthEntries = $derived(
		schedule?.entries?.filter((entry: Entry) => {
			if (!selectedDateString) return false;
			return entryDates.get(entry) === selectedDateString && entry.type === 'strength';
		}) ?? []
	);

	// Training status — O(1) lookups via pre-computed Sets
	function getTrainingStatusForDate(filter: TrainingFilter): TrainingStatus {
		if (!statusIndex) return 'none';

		const year = currentDate.getFullYear();
		const month = currentDate.getMonth();
		const calendarDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(filter.day).padStart(2, '0')}`;

		const today = new Date();
		const targetDate = new Date(year, month, filter.day);
		const isToday = targetDate.toDateString() === today.toDateString();
		const isPast = targetDate < today && !isToday;

		if (filter.type === 'strength') {
			if (statusIndex.completedStrength.has(calendarDate)) return 'completed';
			if (statusIndex.scheduledStrength.has(calendarDate)) return isPast ? 'missed' : 'scheduled';
			return 'none';
		}

		if (statusIndex.completedRuns.has(calendarDate)) return 'completed';
		if (statusIndex.scheduledRuns.has(calendarDate)) return isPast ? 'missed' : 'scheduled';
		return 'none';
	}

	function hasTrainingEntriesForDate(filter: TrainingFilter): boolean {
		return getTrainingStatusForDate(filter) !== 'none';
	}

	// Actions
	function setSelectedDate(date: CalendarDate | null) {
		selectedDate = date;
	}

	function setSchedule(newSchedule: Schedule) {
		schedule = newSchedule;
	}

	async function loadMonthData(date: Date) {
		isLoading = true;
		error = null;

		try {
			currentDate = date;
			const key = monthKey(date);

			// Check cache first
			const cached = scheduleCache.get(key);
			if (cached) {
				schedule = cached;
				return;
			}

			const response = await fetch(`/api/v1/schedule?date=${date.getTime()}`);

			if (!response.ok) {
				throw new Error(`Failed to load schedule: ${response.statusText}`);
			}

			const data = await response.json();
			schedule = data;
			scheduleCache.set(key, data);
		} catch (err) {
			error = err instanceof Error ? err : new Error('Failed to load month data');
			schedule = {
				id: 0,
				start_day: 0,
				start_day_long: '',
				training_week: 0,
				type: 'other',
				trainings: [],
				strength_trainings: [],
				entries: []
			};
		} finally {
			isLoading = false;
		}
	}

	// Navigation
	async function goToPreviousMonth() {
		const newDate = new Date(currentDate);
		newDate.setMonth(newDate.getMonth() - 1);
		selectedDate = null;
		await loadMonthData(newDate);
	}

	async function goToNextMonth() {
		const newDate = new Date(currentDate);
		newDate.setMonth(newDate.getMonth() + 1);
		selectedDate = null;
		await loadMonthData(newDate);
	}

	async function goToToday() {
		const today = new Date();
		selectedDate = {
			year: today.getFullYear(),
			month: today.getMonth(),
			day: today.getDate()
		};
		await loadMonthData(today);
	}

	async function refresh() {
		// Bust cache for current month so we get fresh data
		scheduleCache.delete(monthKey(currentDate));
		await loadMonthData(currentDate);
	}

	return {
		get currentDate() {
			return currentDate;
		},
		get selectedDate() {
			return selectedDate;
		},
		get selectedDateString() {
			return selectedDateString;
		},
		get schedule() {
			return schedule;
		},
		get isLoading() {
			return isLoading;
		},
		get error() {
			return error;
		},
		get filteredTrainings() {
			return filteredTrainings;
		},
		get filteredStrengthTrainings() {
			return filteredStrengthTrainings;
		},
		get monthData() {
			return monthData;
		},
		get selectedRunEntries() {
			return selectedRunEntries;
		},
		get selectedStrengthEntries() {
			return selectedStrengthEntries;
		},

		setSelectedDate,
		setSchedule,
		loadMonthData,
		refresh,

		navigation: {
			goToPreviousMonth,
			goToNextMonth,
			goToToday,
			refresh
		},

		getTrainingStatusForDate,
		hasTrainingEntriesForDate
	};
}

export type CalendarStore = ReturnType<typeof createCalendarStore>;
