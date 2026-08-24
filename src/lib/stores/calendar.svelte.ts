/**
 * Calendar store using Svelte 5 runes
 */

import type {
	Schedule,
	ScheduledTraining,
	StrengthTraining,
	Entry
} from '$lib/server/trenara/types';
import { fingerprint } from '$lib/utils/fingerprint';

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

export interface CalendarStoreOptions {
	/**
	 * Re-runs the page's own `load`, which is where the schedule for the month
	 * the page was opened on comes from — along with the goal and prediction
	 * cards beside the calendar. Supplied by the page; without it the store
	 * simply fetches every month itself.
	 */
	refreshPageData?: () => Promise<unknown>;
}

/**
 * How old a cached month may be before it is served *and* checked. Below this
 * the cache is taken at its word, so paging back and forth stays instant.
 */
export const MONTH_STALE_MS = 5 * 60 * 1000;

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

function isSameDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

function emptySchedule(): Schedule {
	return {
		id: 0,
		start_day: 0,
		start_day_long: '',
		training_week: 0,
		type: 'other',
		trainings: [],
		strength_trainings: [],
		entries: []
	};
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

// ── Month cache ─────────────────────────────────────────────

/**
 * What is kept per visited month.
 *
 * The fingerprint is the point of it: a background refresh that comes back
 * with the very same week is the common case, and swapping the schedule
 * anyway would rebuild every index and re-render the grid for nothing.
 */
type CachedMonth = {
	schedule: Schedule;
	fingerprint: string;
	/** From the API response, for a conditional request next time. */
	etag: string | null;
	fetchedAt: number;
};

// ─────────────────────────────────────────────────────────────

export function createCalendarStore(initialDate: Date, options: CalendarStoreOptions = {}) {
	// Core state
	let currentDate = $state(initialDate);
	let selectedDate = $state<CalendarDate | null>(null);
	let schedule = $state<Schedule | null>(null);
	let isLoading = $state(false);
	let error = $state<Error | null>(null);

	/**
	 * Today, as the store understands it.
	 *
	 * Held as state rather than read from `new Date()` on demand because the
	 * page is expected to outlive the day: at midnight the highlighted cell and
	 * every "scheduled or missed?" verdict have to move on, and they only will
	 * if the thing they read from can change.
	 */
	let today = $state(initialDate);

	/** A refresh happening underneath the UI, as opposed to one blocking it. */
	let isRevalidating = $state(false);
	let lastUpdatedAt = $state<number | null>(null);

	/**
	 * Bumped only when the schedule on screen genuinely changed — not on every
	 * refresh that confirmed it. Anything derived from the plan but fetched
	 * separately, nutrition advice above all, can hang its own cache off this.
	 */
	let scheduleRevision = $state(0);

	// ── Month schedule cache (avoids re-fetching visited months) ──
	const scheduleCache = new Map<string, CachedMonth>();

	// ── Pre-computed status index (rebuilt when schedule changes) ──
	const statusIndex = $derived<StatusIndex | null>(schedule ? buildStatusIndex(schedule) : null);

	// ── Pre-computed entry date cache ─────────────────────────────
	const entryDates = $derived<Map<Entry, string>>(buildEntryDateCache(schedule?.entries ?? []));

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

		let daysInCurrentMonthWithOffset = new Date(year, month + 1, 0).getDate() + firstDayOfMonth - 1;
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

		const targetDate = new Date(year, month, filter.day);
		const isToday = isSameDay(targetDate, today);
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

	/**
	 * Move the store's idea of "today" on, if the clock has left it behind.
	 *
	 * Returns whether it moved, so a caller waking up after midnight can treat
	 * that as reason enough to go and ask the server for the plan again.
	 */
	function syncToday(now: Date = new Date()): boolean {
		if (isSameDay(today, now)) return false;
		today = now;
		return true;
	}

	/**
	 * Put a freshly fetched month into the cache, and on screen if it is the one
	 * being looked at.
	 *
	 * Unchanged payloads stop here: the fingerprint matches, the cache entry is
	 * refreshed so the next conditional request has something to send, and the
	 * schedule the UI is deriving from is left exactly as it was.
	 */
	function commitSchedule(key: string, next: Schedule, etag: string | null = null): boolean {
		const previous = scheduleCache.get(key);
		const print = fingerprint(next);
		const changed = !previous || previous.fingerprint !== print;
		const fetchedAt = Date.now();

		// Unchanged: keep the object already in hand, so the identity every
		// derived index is keyed on survives the refresh.
		const kept = changed ? next : previous.schedule;

		scheduleCache.set(key, {
			schedule: kept,
			fingerprint: print,
			etag: etag ?? (changed ? null : previous.etag),
			fetchedAt
		});

		if (key !== monthKey(currentDate)) return changed;

		lastUpdatedAt = fetchedAt;
		if (changed || schedule === null) {
			schedule = kept;
			scheduleRevision += 1;
		}
		return changed;
	}

	/**
	 * Seed the store with a schedule the page already had.
	 *
	 * `forMonth` says which month it covers. Without it the schedule is taken to
	 * be for the month on screen; with it, a schedule that arrives for a month
	 * the user has since paged away from is filed in the cache instead of
	 * replacing what they are looking at.
	 */
	function setSchedule(newSchedule: Schedule, forMonth?: Date) {
		commitSchedule(monthKey(forMonth ?? currentDate), newSchedule);
	}

	/**
	 * Swap one training for a newer copy of itself.
	 *
	 * Every session mutation hands back the complete training, so changing the
	 * terrain or swapping the workout does not need the week refetching — but it
	 * does need the week updating, or the calendar goes on showing the distance,
	 * title and colour the session had before.
	 *
	 * The month cache is updated alongside, since it holds the very object the
	 * store is serving: without that, leaving the month and coming back would
	 * resurrect the stale copy from cache.
	 */
	function replaceTraining(updated: ScheduledTraining) {
		if (!schedule) return;

		const trainings = schedule.trainings ?? [];
		if (!trainings.some((training) => training.id === updated.id)) return;

		const next: Schedule = {
			...schedule,
			trainings: trainings.map((training) => (training.id === updated.id ? updated : training))
		};

		schedule = next;
		scheduleRevision += 1;

		const key = monthKey(currentDate);
		const previous = scheduleCache.get(key);
		scheduleCache.set(key, {
			schedule: next,
			fingerprint: fingerprint(next),
			etag: null,
			fetchedAt: previous?.fetchedAt ?? Date.now()
		});
	}

	/** One month, straight from the API. Throws; callers decide what that means. */
	async function fetchMonth(
		date: Date,
		conditional: boolean
	): Promise<{ schedule: Schedule; etag: string | null } | null> {
		const cached = scheduleCache.get(monthKey(date));
		const headers: Record<string, string> = {};
		if (conditional && cached?.etag) {
			headers['If-None-Match'] = cached.etag;
		}

		const response = await fetch(`/api/v1/schedule?date=${date.getTime()}`, { headers });

		// Nothing moved — the server recognised the fingerprint we sent.
		if (response.status === 304) return null;

		if (!response.ok) {
			throw new Error(`Failed to load schedule: ${response.statusText}`);
		}

		return {
			schedule: (await response.json()) as Schedule,
			etag: response.headers?.get?.('etag') ?? null
		};
	}

	/**
	 * Fetch a month without anyone noticing.
	 *
	 * Failures are swallowed on purpose: what is on screen came from somewhere
	 * and is still the best answer available, so a refresh that could not reach
	 * the server should leave it alone rather than replace a plan with an error.
	 */
	async function revalidateMonth(date: Date, conditional = true): Promise<void> {
		const key = monthKey(date);
		try {
			const result = await fetchMonth(date, conditional);
			if (!result) {
				const cached = scheduleCache.get(key);
				if (cached) {
					scheduleCache.set(key, { ...cached, fetchedAt: Date.now() });
					if (key === monthKey(currentDate)) lastUpdatedAt = Date.now();
				}
				return;
			}
			commitSchedule(key, result.schedule, result.etag);
		} catch {
			// Keep what we have.
		}
	}

	/**
	 * Go and check everything, without taking the UI away from the runner.
	 *
	 * The month the page was opened on is not fetched here: the page's own
	 * `load` covers it, along with the goal and prediction cards, and asking for
	 * the same five weeks twice would double the work for one screen. Any other
	 * month the user has paged to is fetched directly, since nothing else will.
	 */
	async function revalidate({ force = false }: { force?: boolean } = {}): Promise<void> {
		if (isRevalidating) return;
		isRevalidating = true;

		try {
			const pageCoversCurrentMonth =
				Boolean(options.refreshPageData) && monthKey(currentDate) === monthKey(today);

			await Promise.all([
				options.refreshPageData?.().catch(() => {}),
				pageCoversCurrentMonth ? Promise.resolve() : revalidateMonth(new Date(currentDate), !force)
			]);
		} finally {
			isRevalidating = false;
		}
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
				schedule = cached.schedule;
				lastUpdatedAt = cached.fetchedAt;
				// Shown straight away; checked afterwards if it has been sitting a
				// while, so paging around stays instant but never goes stale.
				if (Date.now() - cached.fetchedAt > MONTH_STALE_MS && !isRevalidating) {
					isRevalidating = true;
					void revalidateMonth(new Date(date)).finally(() => {
						isRevalidating = false;
					});
				}
				return;
			}

			const result = await fetchMonth(date, false);
			if (result) {
				commitSchedule(key, result.schedule, result.etag);
			}
		} catch (err) {
			error = err instanceof Error ? err : new Error('Failed to load month data');
			schedule = emptySchedule();
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
		const now = new Date();
		syncToday(now);
		selectedDate = {
			year: now.getFullYear(),
			month: now.getMonth(),
			day: now.getDate()
		};
		await loadMonthData(now);
	}

	/**
	 * The refresh button, and anything that has just changed the plan.
	 *
	 * Deliberately not a reload: the month stays on screen and is replaced only
	 * once something new has actually arrived. `force` skips the conditional
	 * request, because someone pressing refresh is entitled to a real answer
	 * rather than a 304 from a cache we may have got wrong.
	 */
	async function refresh() {
		await revalidate({ force: true });
	}

	return {
		get currentDate() {
			return currentDate;
		},
		get today() {
			return today;
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
		get isRevalidating() {
			return isRevalidating;
		},
		get lastUpdatedAt() {
			return lastUpdatedAt;
		},
		get scheduleRevision() {
			return scheduleRevision;
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
		replaceTraining,
		loadMonthData,
		revalidate,
		syncToday,
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
