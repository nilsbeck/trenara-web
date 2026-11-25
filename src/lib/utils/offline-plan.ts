import type { Goal, Schedule, UserStats } from '#lib/server/trenara/types.js';
import type { ChartDataPoint } from '#lib/components/charts/prediction-chart.svelte';
import { isRenderableStats } from './user-stats';

/**
 * The plan as it last stood, kept on this device for when there is no
 * connection.
 *
 * The service worker caches no page and no API response, on purpose: a plan
 * served from disk *without saying so* reads as today's plan, and that is the
 * lie the app's error handling exists to avoid. This is the same plan served
 * from disk *saying so* — the offline page (`src/routes/offline`) draws it in
 * the calendar, read-only, under a line carrying `savedAt`.
 *
 * What is kept is the months as the calendar holds them — this month and,
 * when it is held, the next — so the offline calendar is the calendar: the
 * same grid, the same dots, the same weeks. That includes the coach's
 * capability flags, which nothing on the offline page reads; read-only is a
 * property of the page, which draws no control that could act, and it has no
 * network to act over anyway. Written by the dashboard's calendar whenever its
 * copy changes, and removed when the runner signs out (`clearOfflinePlan`,
 * from the logout form and the login page), because unlike a cache entry it
 * would otherwise outlive the session it came from.
 */

/** Separate from the rated-locally key; the shape is versioned by `version`. */
export const OFFLINE_PLAN_KEY = 'trainara:offline-plan';

/**
 * The goal card's data, under a key of its own.
 *
 * Its own because it has its own writer: the dashboard page saves what its
 * load handed the cards, and the calendar saves the months whenever they
 * change. Two writers sharing one key would each overwrite the other's half
 * with whatever they last read of it.
 */
export const OFFLINE_CARDS_KEY = 'trainara:offline-cards';

/**
 * Bumped when the shape changes; a stored plan of another version is ignored.
 * Version 1 was a per-day projection drawn as a list; it never shipped beyond
 * a preview, and is simply not read.
 */
const VERSION = 2;

/** `YYYY-MM`, the calendar's own month key. */
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface OfflineMonth {
	/** `YYYY-MM`. */
	month: string;
	schedule: Schedule;
}

export interface OfflinePlan {
	version: typeof VERSION;
	/**
	 * When the oldest month in it was read from Trenara, in ms. The oldest
	 * rather than the newest, so the banner never claims the plan is fresher
	 * than any part of it is.
	 */
	savedAt: number;
	months: OfflineMonth[];
}

/** A month as the calendar holds it: the schedule, and when it was read. */
export interface HeldMonth extends OfflineMonth {
	fetchedAt: number;
}

/** The plan to keep, or null when there is nothing to keep. */
export function buildOfflinePlan(months: HeldMonth[]): OfflinePlan | null {
	if (months.length === 0) return null;
	return {
		version: VERSION,
		savedAt: Math.min(...months.map((m) => m.fetchedAt)),
		months: months.map(({ month, schedule }) => ({ month, schedule }))
	};
}

/** Local midnight on the 1st of a `YYYY-MM` month. */
export function monthStart(month: string): Date {
	const [year, m] = month.split('-').map(Number);
	return new Date(year, m - 1, 1);
}

function storage(): Storage | null {
	try {
		return typeof window !== 'undefined' ? window.localStorage : null;
	} catch {
		// Some browsers throw on the property itself when storage is blocked.
		return null;
	}
}

/**
 * Keep the plan for next time. Quiet on failure: a private tab, a full quota —
 * none of it is worth disturbing the page that is working, and the worst case
 * is that offline shows the plan from the last time saving did work.
 */
export function saveOfflinePlan(plan: OfflinePlan): void {
	try {
		storage()?.setItem(OFFLINE_PLAN_KEY, JSON.stringify(plan));
	} catch {
		// See above.
	}
}

/** Forget the plan and the cards: the runner has signed out, or is about to. */
export function clearOfflinePlan(): void {
	try {
		storage()?.removeItem(OFFLINE_PLAN_KEY);
		storage()?.removeItem(OFFLINE_CARDS_KEY);
	} catch {
		// Nothing stored that can be reached is nothing to clear.
	}
}

/**
 * Whether a plan is kept at all, without reading it back.
 *
 * For the error page, which lives in the shell every page loads and only
 * needs to know whether to offer the saved plan.
 */
export function hasOfflinePlan(): boolean {
	try {
		return Boolean(storage()?.getItem(OFFLINE_PLAN_KEY));
	} catch {
		return false;
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * A stored month, if it has the shape the calendar indexes by.
 *
 * The three lists are what the store walks without checking; anything inside
 * them is the payload as Trenara sent it and is read the way the live calendar
 * reads it — colours through `trainingColor`, a row with no readable date
 * skipped — so a field that was odd on the way in is no odder here.
 */
function readMonth(raw: unknown): OfflineMonth | null {
	if (!isObject(raw) || typeof raw.month !== 'string' || !MONTH_KEY.test(raw.month)) return null;
	const schedule = raw.schedule;
	if (!isObject(schedule)) return null;
	for (const list of ['trainings', 'strength_trainings', 'entries']) {
		if (!Array.isArray(schedule[list])) return null;
	}
	return { month: raw.month, schedule: schedule as unknown as Schedule };
}

/** The plan kept on this device, or null if there is none this build can read. */
export function readOfflinePlan(): OfflinePlan | null {
	try {
		const raw = storage()?.getItem(OFFLINE_PLAN_KEY);
		if (!raw) return null;

		const parsed: unknown = JSON.parse(raw);
		if (!isObject(parsed) || parsed.version !== VERSION) return null;
		if (typeof parsed.savedAt !== 'number' || !Number.isFinite(parsed.savedAt)) return null;
		if (!Array.isArray(parsed.months)) return null;

		const months = parsed.months
			.map(readMonth)
			.filter((month): month is OfflineMonth => month !== null);
		return months.length > 0 ? { version: VERSION, savedAt: parsed.savedAt, months } : null;
	} catch {
		return null;
	}
}

/** `Tue, Nov 24, 6:42 PM` — when the plan was read, in the runner's own time. */
export function formatSavedAt(savedAt: number): string {
	return new Date(savedAt).toLocaleString('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
}

// ── The goal card ────────────────────────────────────────────

/** Bumped when the shape changes; cards of another version are ignored. */
const CARDS_VERSION = 1;

/** What the dashboard's card column draws (`dashboard-cards.svelte`). */
export interface OfflineCards {
	version: typeof CARDS_VERSION;
	/** When the dashboard's load read these, in ms. */
	savedAt: number;
	goal: Goal | null;
	userStats: UserStats;
	history: ChartDataPoint[];
}

/**
 * Keep the cards for next time. Stats that would not draw are not kept: the
 * dashboard shows "Some data could not be loaded" for them, and replacing a
 * good copy with that would leave the offline page worse off than before.
 */
export function saveOfflineCards(
	cards: Omit<OfflineCards, 'version' | 'userStats'> & {
		userStats: UserStats | null;
	}
): void {
	if (!isRenderableStats(cards.userStats)) return;
	try {
		storage()?.setItem(
			OFFLINE_CARDS_KEY,
			JSON.stringify({ ...cards, userStats: cards.userStats, version: CARDS_VERSION })
		);
	} catch {
		// As for the plan: the worst case is the cards from the last save that worked.
	}
}

/** A point the prediction chart can plot: dated, with numbers where it reads numbers. */
function isChartPoint(value: unknown): value is ChartDataPoint {
	return (
		isObject(value) &&
		typeof value.date === 'string' &&
		typeof value.predictedTime === 'number' &&
		typeof value.predictedPace === 'number' &&
		typeof value.formattedTime === 'string' &&
		typeof value.formattedPace === 'string'
	);
}

/**
 * The cards kept on this device, or null if there are none this build can
 * read. Checked as far as the column itself checks what it is handed — the
 * stats by `isRenderableStats`, the goal by being an object with a name — and
 * no further; the page draws them inside a boundary for the rest.
 */
export function readOfflineCards(): OfflineCards | null {
	try {
		const raw = storage()?.getItem(OFFLINE_CARDS_KEY);
		if (!raw) return null;

		const parsed: unknown = JSON.parse(raw);
		if (!isObject(parsed) || parsed.version !== CARDS_VERSION) return null;
		if (typeof parsed.savedAt !== 'number' || !Number.isFinite(parsed.savedAt)) return null;
		if (!isRenderableStats(parsed.userStats as UserStats | null)) return null;

		const goal = parsed.goal;
		if (goal !== null && !(isObject(goal) && typeof goal.name === 'string')) return null;

		return {
			version: CARDS_VERSION,
			savedAt: parsed.savedAt,
			goal: goal as Goal | null,
			userStats: parsed.userStats as UserStats,
			history: Array.isArray(parsed.history) ? parsed.history.filter(isChartPoint) : []
		};
	} catch {
		return null;
	}
}
