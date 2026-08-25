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
import { stalenessReason } from '$lib/utils/revalidation';
import { getMonthTimestamps, toLocalDateString, weeksStillOpen } from '$lib/utils/date';
import { entryLocalDate, mergeSchedule, type SchedulePayload } from '$lib/utils/schedule';

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
 * How far back a refresh still asks about.
 *
 * The plan only ever changes ahead of the runner, so a finished week could in
 * principle be skipped outright. Completed runs are the exception: a watch that
 * syncs the next morning files an activity against yesterday, and a week that
 * had already been written off would never pick it up. A week's grace covers
 * that for the price of one extra request.
 */
export const REFRESH_LOOKBACK_DAYS = 7;

// ── Helpers (pure, no allocations on hot path) ──────────────

/** Extract YYYY-MM-DD from an ISO timestamp without creating a Date object. */
function isoToDateString(iso: string): string {
	return iso.slice(0, 10);
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
	/**
	 * The colour the API picks per session, by date.
	 *
	 * Its own taxonomy — intervals come through red, easy runs blue — which is
	 * worth more than anything we would invent, since it is the same one the
	 * runner sees in the official app.
	 *
	 * `hex_training` whatever became of the session, so that one session is one
	 * colour and the marker's shape is free to say whether it was run. The
	 * `hex_completed` the API also sends is deliberately unused: it is null in
	 * every capture so far, and a second colour for a session already drawn
	 * would undo exactly that.
	 */
	runColours: Map<string, string>;
};

/** Build O(1) lookup sets from a schedule. Called once per schedule change. */
function buildStatusIndex(schedule: Schedule): StatusIndex {
	const scheduledRuns = new Set<string>();
	const completedRuns = new Set<string>();
	const scheduledStrength = new Set<string>();
	const completedStrength = new Set<string>();

	const runColours = new Map<string, string>();

	for (const t of schedule.trainings ?? []) {
		const date = isoToDateString(t.day_long);
		scheduledRuns.add(date);
		if (t.hex_training) runColours.set(date, t.hex_training);
	}
	for (const s of schedule.strength_trainings ?? []) {
		scheduledStrength.add(isoToDateString(s.day));
	}
	for (const e of schedule.entries ?? []) {
		const d = entryLocalDate(e.start_time);
		if (e.type === 'run') {
			completedRuns.add(d);
		} else if (e.type === 'strength') {
			completedStrength.add(d);
		}
	}

	return { scheduledRuns, completedRuns, scheduledStrength, completedStrength, runColours };
}

// ── Entry date cache ────────────────────────────────────────

/** Pre-compute date strings for all entries so filters don't re-parse. */
function buildEntryDateCache(entries: Entry[]): Map<Entry, string> {
	const map = new Map<Entry, string>();
	for (const e of entries) {
		map.set(e, entryLocalDate(e.start_time));
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

	/**
	 * The colour to draw a day's run marker in, or null to fall back to the theme.
	 *
	 * The same colour whatever became of the session — done, missed or still
	 * ahead — because the colour is what the session *is*. Whether it happened
	 * is the marker's shape to say.
	 *
	 * Null on a day the plan never scheduled: a run logged off-plan has no
	 * session colour to borrow, and falls back to the theme.
	 */
	function getRunColourForDate(day: number, status: TrainingStatus): string | null {
		if (!statusIndex || status === 'none') return null;

		const year = currentDate.getFullYear();
		const month = currentDate.getMonth();
		const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
		return statusIndex.runColours.get(date) ?? null;
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

	/** The oldest day a refresh still asks the server about. */
	function lookbackFrom(): Date {
		const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
		from.setDate(from.getDate() - REFRESH_LOOKBACK_DAYS);
		return from;
	}

	/** Whether every week of a month finished before the lookback — nothing left to ask. */
	function isSettled(date: Date): boolean {
		return weeksStillOpen(getMonthTimestamps(date), lookbackFrom()).anchors.length === 0;
	}

	/** One month, straight from the API. Throws; callers decide what that means. */
	async function fetchMonth(
		date: Date,
		{ conditional, from }: { conditional: boolean; from: Date | null }
	): Promise<{ payload: SchedulePayload; etag: string | null } | null> {
		const cached = scheduleCache.get(monthKey(date));
		const headers: Record<string, string> = {};
		if (conditional && cached?.etag) {
			headers['If-None-Match'] = cached.etag;
		}

		const params = new URLSearchParams({ date: String(date.getTime()) });
		if (from) {
			params.set('from', toLocalDateString(from));
		}

		const response = await fetch(`/api/v1/schedule?${params}`, { headers });

		// Nothing moved — the server recognised the fingerprint we sent.
		if (response.status === 304) return null;

		if (!response.ok) {
			throw new Error(`Failed to load schedule: ${response.statusText}`);
		}

		return {
			payload: (await response.json()) as SchedulePayload,
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
	async function revalidateMonth(
		date: Date,
		{ full = false }: { full?: boolean } = {}
	): Promise<void> {
		// A month whose every week is over cannot have moved. Say nothing to
		// the server about it at all.
		if (isSettled(date)) return;

		const key = monthKey(date);
		const cached = scheduleCache.get(key);

		try {
			const result = await fetchMonth(date, {
				conditional: !full,
				// Only worth asking for part of a month when there is a whole one
				// already in hand for the answer to be grafted onto. A forced
				// refresh asks for all of it, since it is the button people press
				// when they think something is wrong.
				from: full || !cached ? null : lookbackFrom()
			});

			if (!result) {
				if (cached) {
					scheduleCache.set(key, { ...cached, fetchedAt: Date.now() });
					if (key === monthKey(currentDate)) lastUpdatedAt = Date.now();
				}
				return;
			}

			const { covered_from: coveredFrom, ...incoming } = result.payload;
			const next =
				coveredFrom && cached ? mergeSchedule(cached.schedule, incoming, coveredFrom) : incoming;

			commitSchedule(key, next, result.etag);
		} catch {
			// Keep what we have.
		}
	}

	/**
	 * Go and check everything, without taking the UI away from the runner.
	 *
	 * The month on screen is fetched here whichever month it is, and only for
	 * the weeks that can still change. `refreshPageData` runs alongside for
	 * everything else the page is showing — it must not fetch the schedule
	 * itself, or the trimming here buys nothing.
	 */
	async function revalidate({ force = false }: { force?: boolean } = {}): Promise<void> {
		if (isRevalidating) return;
		isRevalidating = true;

		try {
			await Promise.all([
				options.refreshPageData?.().catch(() => {}),
				revalidateMonth(new Date(currentDate), { full: force })
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
				// Shown straight away, and checked afterwards only if it was cached
				// before today's rework — paging between months never costs a request
				// on its own.
				if (stalenessReason(cached.fetchedAt, Date.now()) && !isRevalidating) {
					isRevalidating = true;
					void revalidateMonth(new Date(date)).finally(() => {
						isRevalidating = false;
					});
				}
				return;
			}

			// Nothing cached to graft onto, so the whole month it is.
			const result = await fetchMonth(date, { conditional: false, from: null });
			if (result) {
				const { covered_from: _coverage, ...incoming } = result.payload;
				commitSchedule(key, incoming, result.etag);
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
		getRunColourForDate,
		hasTrainingEntriesForDate
	};
}

export type CalendarStore = ReturnType<typeof createCalendarStore>;
