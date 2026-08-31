/**
 * Calendar store using Svelte 5 runes
 */

import { untrack } from 'svelte';
import type {
	Schedule,
	ScheduledTraining,
	StrengthTraining,
	Entry
} from '$lib/server/trenara/types';
import { fingerprint } from '$lib/utils/fingerprint';
import { stalenessReason } from '$lib/utils/revalidation';
import {
	dayKeyOf,
	formatDateString,
	getMonthTimestamps,
	mondayOf,
	toLocalDateString,
	weeksStillOpen
} from '$lib/utils/date';
import { entryLocalDate, mergeSchedule, type SchedulePayload } from '$lib/utils/schedule';

export type CalendarDate = {
	year: number;
	month: number;
	day: number;
};

/** Whether the grid is showing a whole month or a single folded week. */
export type ViewMode = 'month' | 'week';

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
function isoToDateString(iso: string | null | undefined): string | null {
	return dayKeyOf(iso);
}

/** Build a cache key from a year and a 0-based month (YYYY-MM). */
function monthKeyOf(year: number, month: number): string {
	return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** Build a cache key from a Date (YYYY-MM). */
function monthKey(date: Date): string {
	return monthKeyOf(date.getFullYear(), date.getMonth());
}

/** `n` days on from `date`, at local midnight. */
function addDays(date: Date, days: number): Date {
	const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	next.setDate(next.getDate() + days);
	return next;
}

/** The 1st of `date`'s month, at local midnight. */
function firstOfMonth(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Whether `to` is ahead of `from` (1), behind it (-1), or the same (0). */
function stepSign(from: Date, to: Date): -1 | 0 | 1 {
	if (to.getTime() > from.getTime()) return 1;
	if (to.getTime() < from.getTime()) return -1;
	return 0;
}

/** Monday-first index of a date's weekday: Monday 0 … Sunday 6. */
function weekdayIndex(date: Date): number {
	return (date.getDay() + 6) % 7;
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

	// A row the API sent without a readable date is skipped. It cannot be drawn
	// in any cell anyway, and reaching into it used to throw here — taking the
	// whole month down over one malformed row.
	for (const t of schedule.trainings ?? []) {
		const day = isoToDateString(t.day_long);
		if (day) scheduledRuns.add(day);
	}
	for (const s of schedule.strength_trainings ?? []) {
		const day = isoToDateString(s.day);
		if (day) scheduledStrength.add(day);
	}
	for (const e of schedule.entries ?? []) {
		const d = entryLocalDate(e.start_time);
		if (!d) continue;
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
function buildEntryDateCache(entries: Entry[]): Map<Entry, string | null> {
	const map = new Map<Entry, string | null>();
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
	/**
	 * How many times this month has been changed here rather than fetched.
	 *
	 * A mutation answers with the changed session and the store seats it
	 * immediately — but a background refresh may already have been in flight
	 * when that happened, and its answer predates the change. Seated, it takes
	 * the change back off the screen: the rating prompt returns on a session
	 * the runner has just rated, which reads as the rating having been lost.
	 *
	 * So a request notes this count before it leaves, and its answer is dropped
	 * if the count has moved by the time it lands. A counter rather than a
	 * timestamp because `Date.now()` cannot separate a request that left just
	 * before a change from one that left just after: inside one millisecond
	 * both compare equal, and the second is the one that must be seated.
	 */
	editSeq?: number;
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
	 * Month grid, or the one week folded out of it.
	 *
	 * The week is held as its Monday rather than as a row of the month grid,
	 * because a week does not belong to a month: fold on the 31st and the six
	 * days after it are next month's, and they have to be on screen — and
	 * carrying their training dots — all the same.
	 */
	let viewMode = $state<ViewMode>('month');
	let weekAnchor = $state<Date>(mondayOf(initialDate));

	/**
	 * Whether the runner has used the fold arrow themselves.
	 *
	 * Once they have, the screen size stops having an opinion: a window dragged
	 * across the breakpoint, or a phone turned on its side, must not undo the
	 * view they just asked for.
	 */
	let viewModeChosen = $state(false);

	/**
	 * Which way the view last stepped: 1 forward, -1 back, 0 for a move that is
	 * neither — the opening month, a fold, a jump to today's week.
	 *
	 * Only the grid reads it, and only to decide which edge to bring the new
	 * period in from. Nothing about what is shown depends on it, so a stale or
	 * zeroed value costs an animation and nothing else.
	 */
	let navigationDirection = $state<-1 | 0 | 1>(0);

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

	/**
	 * Bumped whenever the cache is written to, so anything derived from a month
	 * other than the one on screen — the neighbouring month a folded week reaches
	 * into — re-runs when that month arrives. The Map itself is not reactive.
	 */
	let cacheRevision = $state(0);

	/**
	 * Untracked on the way in: the increment reads the counter as well as writing
	 * it, and the effect that hands the page's schedule down calls through to
	 * here — a tracked read would make that effect its own trigger.
	 */
	function bumpCacheRevision() {
		cacheRevision = untrack(() => cacheRevision) + 1;
	}

	// ── Pre-computed status index (rebuilt when schedule changes) ──
	const statusIndex = $derived<StatusIndex | null>(schedule ? buildStatusIndex(schedule) : null);

	// ── Pre-computed entry date cache ─────────────────────────────
	const entryDates = $derived<Map<Entry, string | null>>(
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

	// Derived: the seven days of the folded week, Monday first.
	const weekDays = $derived.by<CalendarDate[]>(() => {
		const monday = weekAnchor;
		return Array.from({ length: 7 }, (_, i) => {
			const date = addDays(monday, i);
			return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
		});
	});

	/**
	 * Status lookups for the months the folded week reaches into.
	 *
	 * The month on screen is served by `statusIndex` off the live schedule; this
	 * covers the days either side of a week that straddles two months, which come
	 * from whatever that month left in the cache.
	 */
	const weekStatusIndexes = $derived.by<Map<string, StatusIndex>>(() => {
		const indexes = new Map<string, StatusIndex>();
		if (viewMode !== 'week') return indexes;

		// Read so the map is rebuilt when a neighbouring month lands in the cache.
		void cacheRevision;

		for (const day of weekDays) {
			const key = monthKeyOf(day.year, day.month);
			if (indexes.has(key)) continue;
			const cached = scheduleCache.get(key);
			if (cached) indexes.set(key, buildStatusIndex(cached.schedule));
		}
		return indexes;
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

	/** Whichever index speaks for a given month: the live one, or the cache. */
	function indexForMonth(year: number, month: number): StatusIndex | null {
		if (year === currentDate.getFullYear() && month === currentDate.getMonth()) {
			return statusIndex;
		}
		return weekStatusIndexes.get(monthKeyOf(year, month)) ?? null;
	}

	/**
	 * Status for an absolute day, whichever month it belongs to.
	 *
	 * A day outside the month on screen only comes up in the folded week view,
	 * and only resolves once that month has been fetched — until then it reads
	 * as 'none', the same as a day with nothing planned.
	 */
	function getTrainingStatusForDay(
		date: CalendarDate,
		type: TrainingFilter['type']
	): TrainingStatus {
		const index = indexForMonth(date.year, date.month);
		if (!index) return 'none';

		const calendarDate = formatDateString(date.year, date.month, date.day);

		const targetDate = new Date(date.year, date.month, date.day);
		const isToday = isSameDay(targetDate, today);
		const isPast = targetDate < today && !isToday;

		if (type === 'strength') {
			if (index.completedStrength.has(calendarDate)) return 'completed';
			if (index.scheduledStrength.has(calendarDate)) return isPast ? 'missed' : 'scheduled';
			return 'none';
		}

		if (index.completedRuns.has(calendarDate)) return 'completed';
		if (index.scheduledRuns.has(calendarDate)) return isPast ? 'missed' : 'scheduled';
		return 'none';
	}

	/** Status for a day of the month on screen, by day number. */
	function getTrainingStatusForDate(filter: TrainingFilter): TrainingStatus {
		return getTrainingStatusForDay(
			{
				year: currentDate.getFullYear(),
				month: currentDate.getMonth(),
				day: filter.day
			},
			filter.type
		);
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
	function commitSchedule(
		key: string,
		next: Schedule,
		etag: string | null = null,
		/**
		 * The month's `editSeq` when the request that produced `next` left.
		 * Omitted by callers that are not answering a request — the page's own
		 * seed — which are always seated.
		 */
		seenEditSeq?: number
	): boolean {
		const previous = scheduleCache.get(key);
		const editSeq = previous?.editSeq ?? 0;

		// The month changed here while this was in flight, so the answer cannot
		// know about the change. Dropped rather than merged: `lastUpdatedAt` is
		// left where it was, which is what has the revalidation trigger come
		// back for an answer that does know.
		if (seenEditSeq !== undefined && seenEditSeq !== editSeq) return false;

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
			fetchedAt,
			editSeq
		});
		bumpCacheRevision();

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
	 * A list with one member swapped for a newer copy of itself, or `null` when
	 * the list does not hold it.
	 *
	 * `null` rather than the list unchanged, so a caller can tell "nothing to
	 * do" from "done" without comparing: the runner who paged to another month
	 * while a change was in flight must not have it committed underneath them.
	 */
	function withReplaced<T extends { id: number }>(items: T[] | undefined, updated: T): T[] | null {
		if (!items?.some((item) => item.id === updated.id)) return null;
		return items.map((item) => (item.id === updated.id ? updated : item));
	}

	/**
	 * Serve a schedule rebuilt around one changed member.
	 *
	 * The month cache is written alongside because it holds the very object the
	 * store is serving: without that, leaving the month and coming back would
	 * resurrect the stale copy from cache. `fetchedAt` is carried over rather
	 * than reset — the week was not refetched, and pretending otherwise would
	 * postpone the next revalidation.
	 */
	function commitReplacement(next: Schedule) {
		schedule = next;
		scheduleRevision += 1;

		const key = monthKey(currentDate);
		const previous = scheduleCache.get(key);
		scheduleCache.set(key, {
			schedule: next,
			fingerprint: fingerprint(next),
			etag: null,
			fetchedAt: previous?.fetchedAt ?? Date.now(),
			editSeq: (previous?.editSeq ?? 0) + 1
		});
		bumpCacheRevision();
	}

	/**
	 * Swap one training for a newer copy of itself.
	 *
	 * Every session mutation hands back the complete training, so changing the
	 * terrain or swapping the workout does not need the week refetching — but it
	 * does need the week updating, or the calendar goes on showing the distance,
	 * title and colour the session had before.
	 */
	function replaceTraining(updated: ScheduledTraining) {
		const trainings = withReplaced(schedule?.trainings, updated);
		if (!schedule || !trainings) return;

		commitReplacement({ ...schedule, trainings });
	}

	/**
	 * Swap one completed entry for a newer copy of itself.
	 *
	 * The same move as `replaceTraining` against the other half of the week —
	 * the plan and what was actually run are two lists in one payload, with ids
	 * from different spaces, so which list is being patched is the whole of the
	 * difference.
	 *
	 * Rating a session answers with the whole entry — `rpe` set and
	 * `ask_feedback` retired — so the rating lands on the calendar without a
	 * refetch, which on this app is five or six upstream requests for a month
	 * the runner is already looking at.
	 */
	function replaceEntry(updated: Entry) {
		const entries = withReplaced(schedule?.entries, updated);
		if (!schedule || !entries) return;

		commitReplacement({ ...schedule, entries });
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
		{
			conditional,
			from,
			fresh = false
		}: { conditional: boolean; from: Date | null; fresh?: boolean }
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
		// Weeks are held for a minute on the server to stay inside Trenara's
		// rate limit. Someone who pressed refresh is entitled to go past that,
		// for the same reason they are entitled to skip the conditional request.
		if (fresh) {
			params.set('fresh', '1');
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
		// Noted as the request leaves; see `CachedMonth.editSeq`.
		const seenEditSeq = cached?.editSeq ?? 0;

		try {
			const result = await fetchMonth(date, {
				conditional: !full,
				fresh: full,
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

			commitSchedule(key, next, result.etag, seenEditSeq);
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
				revalidateMonth(new Date(currentDate), { full: force }),
				// A folded week that straddles the turn of a month is showing days
				// out of the month next door, so that one has to be checked too or
				// half the row goes stale.
				...spilloverMonths().map((date) => revalidateMonth(date, { full: force }))
			]);
		} finally {
			isRevalidating = false;
		}
	}

	/** The months the folded week reaches into, other than the one on screen. */
	function spilloverMonths(): Date[] {
		if (viewMode !== 'week') return [];

		const seen = new Set([monthKey(currentDate)]);
		const months: Date[] = [];
		for (const day of weekDays) {
			const key = monthKeyOf(day.year, day.month);
			if (seen.has(key)) continue;
			seen.add(key);
			months.push(new Date(day.year, day.month, 1));
		}
		return months;
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
			// Noted as the request leaves; see `CachedMonth.editSeq`.
			const seenEditSeq = scheduleCache.get(key)?.editSeq ?? 0;
			const result = await fetchMonth(date, { conditional: false, from: null });
			if (result) {
				const { covered_from: _coverage, ...incoming } = result.payload;
				commitSchedule(key, incoming, result.etag, seenEditSeq);
			}
		} catch (err) {
			error = err instanceof Error ? err : new Error('Failed to load month data');
			schedule = emptySchedule();
		} finally {
			isLoading = false;
		}
	}

	/**
	 * Put a month in the cache without taking anyone off the one they are on.
	 *
	 * `commitSchedule` only swaps the schedule being rendered when the month it
	 * is given is the month on screen, so this is safe to run for the neighbour a
	 * folded week spills into: the dots for those days light up, nothing else
	 * moves. Failures are swallowed — a week missing next month's dots is a lot
	 * better than a week replaced by an error.
	 */
	async function prefetchMonth(date: Date): Promise<void> {
		const key = monthKey(date);
		if (scheduleCache.has(key)) return;

		try {
			const result = await fetchMonth(date, { conditional: false, from: null });
			if (!result) return;
			const { covered_from: _coverage, ...incoming } = result.payload;
			commitSchedule(key, incoming, result.etag);
		} catch {
			// Leave the day without its dots.
		}
	}

	/** Fetch whatever months the folded week needs and does not already have. */
	async function ensureWeekMonthsLoaded(): Promise<void> {
		const keys = new Set<string>();
		const pending: Date[] = [];

		for (const day of weekDays) {
			const key = monthKeyOf(day.year, day.month);
			if (keys.has(key) || scheduleCache.has(key)) continue;
			keys.add(key);
			pending.push(new Date(day.year, day.month, 1));
		}

		await Promise.all(pending.map((date) => prefetchMonth(date)));
	}

	/**
	 * Pick a day, wherever it falls.
	 *
	 * In the folded week the day clicked can belong to the month either side of
	 * the one loaded, and the panel underneath reads its session out of the
	 * schedule in hand — so the month has to follow the pick.
	 */
	async function selectDay(date: CalendarDate): Promise<void> {
		selectedDate = date;

		const picked = new Date(date.year, date.month, date.day);
		if (monthKey(picked) !== monthKey(currentDate)) {
			await loadMonthData(picked);
		}
	}

	/** The day a fold should open on: what is selected, else today, else the 1st. */
	function foldAnchorDay(): Date {
		if (selectedDate) {
			return new Date(selectedDate.year, selectedDate.month, selectedDate.day);
		}
		if (
			today.getFullYear() === currentDate.getFullYear() &&
			today.getMonth() === currentDate.getMonth()
		) {
			return new Date(today.getFullYear(), today.getMonth(), today.getDate());
		}
		return new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
	}

	/**
	 * Which month a week counts as, when nothing is selected to say otherwise.
	 *
	 * Its Thursday, the ISO rule: a week that straddles the turn of the month
	 * belongs to whichever month holds the most of it, so unfolding it lands on
	 * the month the runner was actually looking at.
	 */
	function weekOwnerDay(): Date {
		if (selectedDate) {
			return new Date(selectedDate.year, selectedDate.month, selectedDate.day);
		}
		return addDays(weekAnchor, 3);
	}

	async function setViewMode(mode: ViewMode): Promise<void> {
		if (mode === viewMode) return;

		// Folding is a change of scale, not a step through time: the grid should
		// swap rather than slide in from one side or the other.
		navigationDirection = 0;

		if (mode === 'week') {
			weekAnchor = mondayOf(foldAnchorDay());
			viewMode = 'week';
			await ensureWeekMonthsLoaded();
			return;
		}

		viewMode = 'month';
		const owner = weekOwnerDay();
		if (monthKey(owner) !== monthKey(currentDate)) {
			await loadMonthData(owner);
		}
	}

	async function toggleViewMode(): Promise<void> {
		viewModeChosen = true;
		await setViewMode(viewMode === 'month' ? 'week' : 'month');
	}

	/**
	 * What the viewport would like the view to be.
	 *
	 * A phone has room for one week and the session underneath it, where a
	 * desktop has room for the month — so the screen picks the opening view, and
	 * goes on picking it while the runner has not said otherwise.
	 */
	async function setPreferredViewMode(mode: ViewMode): Promise<void> {
		if (viewModeChosen) return;
		await setViewMode(mode);
	}

	/**
	 * Step the folded week, carrying the selection with it.
	 *
	 * The picked weekday moves along rather than being dropped, because in the
	 * folded view the panel below the week is the whole of the content: clearing
	 * the selection the way paging a month does would empty the screen on every
	 * step.
	 */
	async function goToWeek(delta: number): Promise<void> {
		navigationDirection = delta > 0 ? 1 : -1;
		weekAnchor = addDays(weekAnchor, delta * 7);

		if (selectedDate) {
			const previous = new Date(selectedDate.year, selectedDate.month, selectedDate.day);
			const moved = addDays(weekAnchor, weekdayIndex(previous));
			selectedDate = {
				year: moved.getFullYear(),
				month: moved.getMonth(),
				day: moved.getDate()
			};
		}

		const owner = weekOwnerDay();
		if (monthKey(owner) !== monthKey(currentDate)) {
			await loadMonthData(owner);
		}
		await ensureWeekMonthsLoaded();
	}

	async function goToPreviousWeek() {
		await goToWeek(-1);
	}

	async function goToNextWeek() {
		await goToWeek(1);
	}

	// Navigation
	async function goToPreviousMonth() {
		navigationDirection = -1;
		const newDate = new Date(currentDate);
		newDate.setMonth(newDate.getMonth() - 1);
		selectedDate = null;
		await loadMonthData(newDate);
	}

	async function goToNextMonth() {
		navigationDirection = 1;
		const newDate = new Date(currentDate);
		newDate.setMonth(newDate.getMonth() + 1);
		selectedDate = null;
		await loadMonthData(newDate);
	}

	async function goToToday() {
		const now = new Date();
		// A jump can land either side of where the grid is sitting, so work the
		// direction out from the distance rather than assuming one.
		const from = viewMode === 'week' ? weekAnchor : firstOfMonth(currentDate);
		const to = viewMode === 'week' ? mondayOf(now) : firstOfMonth(now);
		navigationDirection = stepSign(from, to);
		syncToday(now);
		selectedDate = {
			year: now.getFullYear(),
			month: now.getMonth(),
			day: now.getDate()
		};
		weekAnchor = mondayOf(now);
		await loadMonthData(now);
		if (viewMode === 'week') await ensureWeekMonthsLoaded();
	}

	/** Back one step, of whatever size the view is currently showing. */
	async function goToPrevious() {
		if (viewMode === 'week') return goToPreviousWeek();
		return goToPreviousMonth();
	}

	/** Forward one step, of whatever size the view is currently showing. */
	async function goToNext() {
		if (viewMode === 'week') return goToNextWeek();
		return goToNextMonth();
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
		get viewMode() {
			return viewMode;
		},
		get viewModeChosen() {
			return viewModeChosen;
		},
		get navigationDirection() {
			return navigationDirection;
		},
		get weekDays() {
			return weekDays;
		},
		get selectedRunEntries() {
			return selectedRunEntries;
		},
		get selectedStrengthEntries() {
			return selectedStrengthEntries;
		},

		setSelectedDate,
		selectDay,
		setViewMode,
		setPreferredViewMode,
		toggleViewMode,
		setSchedule,
		replaceTraining,
		replaceEntry,
		loadMonthData,
		revalidate,
		syncToday,
		refresh,

		navigation: {
			goToPrevious,
			goToNext,
			goToPreviousMonth,
			goToNextMonth,
			goToPreviousWeek,
			goToNextWeek,
			goToToday,
			refresh
		},

		getTrainingStatusForDate,
		getTrainingStatusForDay,
		hasTrainingEntriesForDate
	};
}

export type CalendarStore = ReturnType<typeof createCalendarStore>;
