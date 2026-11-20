import { describe, it, expect, vi, beforeEach } from 'vitest';
import { load as rawLoad } from './+page.server';
import type { ChartDataPoint } from '#lib/components/charts/prediction-chart.svelte';
import { createTiming } from '#lib/server/timing.js';

/** `PageServerLoad` admits `void`; this load never returns it. */
async function load(...args: Parameters<typeof rawLoad>) {
	const data = await rawLoad(...args);
	if (!data) throw new Error('load returned void');
	return data;
}

const mockGetSchedule = vi.fn();
const mockGetGoal = vi.fn();
const mockGetUserStats = vi.fn();
vi.mock('#lib/server/trenara/index.js', () => ({
	trainingApi: {
		getSchedule: (...args: unknown[]) => mockGetSchedule(...args),
		getGoal: (...args: unknown[]) => mockGetGoal(...args)
	},
	userApi: { getUserStats: (...args: unknown[]) => mockGetUserStats(...args) }
}));

const mockKeepHistory = vi.fn();
vi.mock('#lib/server/history/record.js', () => ({
	keepHistory: (...args: unknown[]) => mockKeepHistory(...args)
}));

const mockAfterResponse = vi.fn();
vi.mock('#lib/server/after-response.js', () => ({
	afterResponse: (...args: unknown[]) => mockAfterResponse(...args)
}));

const mockGetUserPredictionHistory = vi.fn();
vi.mock('#lib/server/db/prediction-history.js', () => ({
	predictionHistoryDAO: {
		getUserPredictionHistory: (...args: unknown[]) => mockGetUserPredictionHistory(...args)
	}
}));

const mockListLive = vi.fn();
vi.mock('#lib/server/db/goal-share.js', () => ({
	goalShareDAO: { listLive: (...args: unknown[]) => mockListLive(...args) }
}));

const week = {
	id: 1,
	start_day: 0,
	start_day_long: '',
	training_week: 1,
	type: 'ultimate',
	trainings: [{ id: 1 }],
	strength_trainings: [],
	entries: []
};
const goal = { id: 7, name: 'Berlin Marathon', start_date: '2026-01-06' };
const stats = { best_times: { time_for_goal: '3:35:00', pace_for_goal: '5:06 min/km' } };

function makeEvent({
	cookies = {},
	headers = {}
}: { cookies?: Record<string, string>; headers?: Record<string, string> } = {}) {
	return {
		cookies: { get: (name: string) => cookies[name] },
		locals: { user: { id: 42, email: '' } },
		request: new Request('https://trainara.test/dashboard', { headers }),
		isDataRequest: false
	} as unknown as Parameters<typeof rawLoad>[0];
}

describe('dashboard load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetSchedule.mockResolvedValue(week);
		mockGetGoal.mockResolvedValue(goal);
		mockGetUserStats.mockResolvedValue(stats);
		mockGetUserPredictionHistory.mockResolvedValue([
			{ recorded_at: '2026-09-01', predicted_time: '3:40:00', predicted_pace: '5:13' }
		]);
		mockListLive.mockResolvedValue([{ goal_id: 7, token: 't'.repeat(43), title: 'Race day' }]);
	});

	/**
	 * The calendar's opening view is decided here, so the server draws what
	 * the phone's media query will ask for instead of a month it then folds.
	 * See `#lib/utils/opening-view` for the rule.
	 */
	/**
	 * On a launch onto this page `handleAuth` has already sent these, beside
	 * the identity check. Asking again here would be the very wait the head
	 * start exists to remove — or, with `fresh`, a second request for each.
	 */
	it('uses the reads the hook already started instead of asking again', async () => {
		const event = makeEvent();
		event.locals.dashboardReads = {
			schedule: Promise.resolve({ ...week, trainings: [{ id: 99 }] } as never),
			goal: Promise.resolve(goal as never),
			stats: Promise.resolve(stats as never)
		};

		const data = await load(event);

		expect(mockGetSchedule).not.toHaveBeenCalled();
		expect(data.schedule.trainings).toEqual([{ id: 99 }]);
		expect(data.goal).toEqual(goal);
	});

	it('times each of its reads for the Server-Timing header', async () => {
		const timing = createTiming();
		const event = makeEvent();
		event.locals.timing = timing;

		await load(event);
		await new Promise((resolve) => setTimeout(resolve, 0));

		const header = timing.header();
		for (const name of ['schedule', 'goal', 'stats', 'chart', 'share']) {
			expect(header).toContain(`${name};dur=`);
		}
	});

	it('tells the calendar which view to open on', async () => {
		expect((await load(makeEvent({ cookies: { 'calendar-view': 'week' } }))).openingView).toBe(
			'week'
		);
		expect(
			(
				await load(
					makeEvent({
						headers: {
							'user-agent':
								'Mozilla/5.0 (iPhone; CPU iPhone OS 19_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
						}
					})
				)
			).openingView
		).toBe('week');
		expect((await load(makeEvent())).openingView).toBe('month');
	});

	it('answers without waiting for the history write, and hands it to afterResponse', async () => {
		// A write that never finishes: the old load awaited it and hung here.
		const pending = new Promise<void>(() => {});
		mockKeepHistory.mockReturnValue(pending);

		const data = await load(makeEvent());

		expect(data.schedule.trainings.length).toBeGreaterThan(0);
		expect(mockKeepHistory).toHaveBeenCalledWith(expect.anything(), 42);
		expect(mockAfterResponse).toHaveBeenCalledWith(pending);
	});

	it("lays today's reading over the stored chart, since the write has not landed", async () => {
		mockKeepHistory.mockReturnValue(new Promise(() => {}));

		const data = await load(makeEvent());

		expect(data.history.error).toBeNull();
		expect(data.history.records.map((p: ChartDataPoint) => p.formattedTime)).toEqual([
			'3:40:00',
			'3:35:00'
		]);
		expect(mockGetUserPredictionHistory).toHaveBeenCalledWith(42, {
			limit: 200,
			newestFirst: true
		});
	});

	it('sends only the share fields the button renders', async () => {
		mockKeepHistory.mockResolvedValue(undefined);

		const data = await load(makeEvent());

		expect(data.share).toEqual({ token: 't'.repeat(43), title: 'Race day' });
		expect(mockListLive).toHaveBeenCalledWith(42);
	});

	it('renders without a goal: no share link, the chart unfiltered', async () => {
		mockKeepHistory.mockResolvedValue(undefined);
		mockGetGoal.mockRejectedValue(new Error('No result found'));

		const data = await load(makeEvent());

		expect(data.goal).toBeNull();
		expect(data.share).toBeNull();
		expect(data.history.records.map((p: ChartDataPoint) => p.formattedTime)).toEqual([
			'3:40:00',
			'3:35:00'
		]);
	});

	/**
	 * The goal card's two database reads used to wait for the goal — one
	 * needed its start date, the other its id — and on the first measured
	 * preview load they were the last thing the page waited for.
	 */
	it("sends the goal card's database reads before the goal has answered", async () => {
		let answerGoal!: () => void;
		const event = makeEvent();
		event.locals.dashboardReads = {
			schedule: Promise.resolve(week as never),
			goal: new Promise((resolve) => (answerGoal = () => resolve(goal as never))),
			stats: Promise.resolve(stats as never)
		};

		const data = load(event);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(mockGetUserPredictionHistory).toHaveBeenCalledTimes(1);
		expect(mockListLive).toHaveBeenCalledTimes(1);
		answerGoal();
		expect((await data).share).toEqual({ token: 't'.repeat(43), title: 'Race day' });
	});

	it('shows a failed chart read inline rather than failing the page', async () => {
		mockKeepHistory.mockResolvedValue(undefined);
		mockGetUserPredictionHistory.mockRejectedValue(new Error('down'));

		const data = await load(makeEvent());

		expect(data.history.records).toEqual([]);
		expect(data.history.error).toBeTruthy();
		expect(data.schedule).toBeTruthy();
	});
});
