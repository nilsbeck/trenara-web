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

export function createCalendarStore(initialDate: Date) {
	// Core state
	let currentDate = $state(initialDate);
	let selectedDate = $state<CalendarDate | null>(null);
	let schedule = $state<Schedule | null>(null);
	let isLoading = $state(false);
	let error = $state<Error | null>(null);

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

	function getDateFromOffset(isoString: string): string {
		const date = new Date(isoString);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	// Derived: entries filtered for selected date (run)
	const selectedRunEntries = $derived(
		schedule?.entries?.filter((entry: Entry) => {
			if (!selectedDateString) return false;
			const entryDate = getDateFromOffset(new Date(entry.start_time).toISOString());
			return entryDate === selectedDateString && entry.type === 'run';
		}) ?? []
	);

	// Derived: entries filtered for selected date (strength)
	const selectedStrengthEntries = $derived(
		schedule?.entries?.filter((entry: Entry) => {
			if (!selectedDateString) return false;
			const entryDate = getDateFromOffset(new Date(entry.start_time).toISOString());
			return entryDate === selectedDateString && entry.type === 'strength';
		}) ?? []
	);

	// Training status methods
	function getTrainingStatusForDate(filter: TrainingFilter): TrainingStatus {
		if (
			!schedule ||
			(!schedule.trainings?.length &&
				!schedule.strength_trainings?.length &&
				!schedule.entries?.length)
		) {
			return 'none';
		}

		const year = currentDate.getFullYear();
		const month = currentDate.getMonth();
		const calendarDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(filter.day).padStart(2, '0')}`;

		const today = new Date();
		const targetDate = new Date(year, month, filter.day);
		const isToday = targetDate.toDateString() === today.toDateString();
		const isPast = targetDate < today && !isToday;

		if (filter.type === 'strength') {
			const hasScheduledStrength = schedule.strength_trainings?.some(
				(entry: StrengthTraining) => {
					const entryDate = new Date(entry.day).toISOString().split('T')[0];
					return entryDate === calendarDate;
				}
			);

			const hasCompletedStrength = schedule.entries?.some((entry: Entry) => {
				const entryDate = new Date(entry.start_time).toISOString().split('T')[0];
				return entryDate === calendarDate && entry.type === 'strength';
			});

			if (hasCompletedStrength) return 'completed';
			if (hasScheduledStrength) return isPast ? 'missed' : 'scheduled';
			return 'none';
		}

		const hasScheduledRun = schedule.trainings?.some((entry: ScheduledTraining) => {
			const entryDate = new Date(entry.day_long).toISOString().split('T')[0];
			return entryDate === calendarDate;
		});

		const hasCompletedRun = schedule.entries?.some((entry: Entry) => {
			const entryDate = new Date(entry.start_time).toISOString().split('T')[0];
			return entryDate === calendarDate && entry.type === 'run';
		});

		if (hasCompletedRun) return 'completed';
		if (hasScheduledRun) return isPast ? 'missed' : 'scheduled';
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

			const response = await fetch(`/api/v1/schedule?date=${date.getTime()}`);

			if (!response.ok) {
				throw new Error(`Failed to load schedule: ${response.statusText}`);
			}

			const data = await response.json();
			schedule = data;
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
