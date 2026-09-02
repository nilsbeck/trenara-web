import { describe, it, expect, vi, beforeEach } from 'vitest';
import { load as rawLoad } from './+page.server';

/**
 * `PageServerLoad`'s declared type admits `void` — a load function may return
 * nothing, meaning "inherit the parent's data" — even though this one never
 * does. The guard is for the type checker: every call here either resolves an
 * object or the surrounding `error(...)` throw is what the test is asserting
 * on.
 */
async function load(...args: Parameters<typeof rawLoad>) {
	const data = await rawLoad(...args);
	if (!data) throw new Error('load returned void');
	return data;
}

const mockGetLiveByToken = vi.fn();
vi.mock('$lib/server/db/goal-share', () => ({
	goalShareDAO: { getLiveByToken: (...args: unknown[]) => mockGetLiveByToken(...args) }
}));

const mockGetUserPredictionHistory = vi.fn();
vi.mock('$lib/server/db/prediction-history', () => ({
	predictionHistoryDAO: {
		getUserPredictionHistory: (...args: unknown[]) => mockGetUserPredictionHistory(...args)
	}
}));

const mockCheck = vi.fn();
vi.mock('$lib/server/security/rate-limit', () => ({
	shareViews: { check: (...args: unknown[]) => mockCheck(...args) }
}));

const VALID_TOKEN = 'a'.repeat(43);

const snapshot = {
	v: 1,
	goal: {
		name: 'Berlin Marathon',
		start_date: '2026-01-06',
		end_date: '2026-09-27',
		distance: '42.195 km',
		distance_unit: 'km',
		distance_value: 42.195,
		time: '3:30:00',
		time_in_sec: 12600,
		pace: '5:00 min/km'
	},
	best_times: { time_for_goal: '3:35:00', pace_for_goal: '5:06 min/km' },
	plan_weeks: {
		data: [],
		done: '0 km',
		done_value: 0,
		done_unit: 'km',
		done_unit_text: 'km',
		todo: '0 km',
		todo_value: 0,
		todo_unit: 'km',
		todo_unit_text: 'km'
	}
};

const shareRow = {
	token: VALID_TOKEN,
	title: 'Race day',
	display_name: 'Nils',
	snapshot,
	snapshot_at: '2026-08-01T00:00:00Z',
	user_id: 42,
	goal_id: 7
};

const predictionRecord = {
	id: 1,
	user_id: 42,
	predicted_time: '3:35:00',
	predicted_pace: '5:06',
	predicted_time_10k: null,
	predicted_pace_10k: null,
	recorded_at: '2026-08-01',
	created_at: '2026-08-01T00:00:00Z'
};

const setHeadersCalls: Record<string, string>[] = [];

function makeEvent(token: string, ip = '203.0.113.5') {
	setHeadersCalls.length = 0;
	return {
		params: { token },
		getClientAddress: () => ip,
		setHeaders: (h: Record<string, string>) => setHeadersCalls.push(h)
	} as never;
}

beforeEach(() => {
	vi.clearAllMocks();
	mockCheck.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
	mockGetLiveByToken.mockResolvedValue(shareRow);
	mockGetUserPredictionHistory.mockResolvedValue([predictionRecord]);
});

describe('load /s/[token]', () => {
	it('sets noindex, no-referrer and a short cache header', async () => {
		await load(makeEvent(VALID_TOKEN));
		expect(setHeadersCalls[0]).toEqual(
			expect.objectContaining({
				'x-robots-tag': 'noindex, nofollow',
				'referrer-policy': 'no-referrer',
				'cache-control': expect.stringContaining('max-age=60')
			})
		);
	});

	it('answers a malformed token with 404, spending no query', async () => {
		await expect(load(makeEvent('too-short'))).rejects.toThrow();
		expect(mockGetLiveByToken).not.toHaveBeenCalled();
	});

	it('answers an unknown token with 404', async () => {
		mockGetLiveByToken.mockResolvedValue(null);
		await expect(load(makeEvent(VALID_TOKEN))).rejects.toThrow();
	});

	it('answers a revoked token exactly like an unknown one', async () => {
		// `getLiveByToken` itself filters out revoked rows, so from this load's
		// point of view a revoked token and an unknown one are the same null.
		mockGetLiveByToken.mockResolvedValue(null);
		let unknown: unknown;
		try {
			await load(makeEvent('b'.repeat(43)));
		} catch (e) {
			unknown = e;
		}

		mockGetLiveByToken.mockResolvedValue(null);
		let revoked: unknown;
		try {
			await load(makeEvent(VALID_TOKEN));
		} catch (e) {
			revoked = e;
		}

		expect(revoked).toEqual(unknown);
	});

	it('renders the waiting state when the link has no snapshot yet', async () => {
		mockGetLiveByToken.mockResolvedValue({ ...shareRow, snapshot: null, snapshot_at: null });
		const data = await load(makeEvent(VALID_TOKEN));
		expect(data.goal).toBeNull();
		expect(data.userStats).toBeNull();
		expect(mockGetUserPredictionHistory).not.toHaveBeenCalled();
	});

	it('renders the waiting state rather than throwing on a snapshot this deploy cannot parse', async () => {
		mockGetLiveByToken.mockResolvedValue({
			...shareRow,
			snapshot: { v: 2, somethingElse: true }
		});
		const data = await load(makeEvent(VALID_TOKEN));
		expect(data.goal).toBeNull();
	});

	it("reads history for the share row's user_id, never for anything in the request", async () => {
		await load(makeEvent(VALID_TOKEN));
		expect(mockGetUserPredictionHistory).toHaveBeenCalledWith(
			42,
			expect.objectContaining({ startDate: '2026-01-06', limit: 200 })
		);
	});

	it('renders the goal and stats projected from the snapshot', async () => {
		const data = await load(makeEvent(VALID_TOKEN));
		expect(data.goal).toEqual(snapshot.goal);
		expect(data.userStats).toEqual({
			best_times: snapshot.best_times,
			graph_stats: { goal: snapshot.plan_weeks }
		});
		expect(data.title).toBe('Race day');
		expect(data.name).toBe('Nils');
		expect(data.snapshotAt).toBe('2026-08-01T00:00:00Z');
	});

	it('is rate-limited by IP', async () => {
		mockCheck.mockReturnValue({ allowed: false, retryAfterSeconds: 10 });
		await expect(load(makeEvent(VALID_TOKEN))).rejects.toThrow();
		expect(mockGetLiveByToken).not.toHaveBeenCalled();
	});

	it('shows history as failed rather than failing the page when the read errors', async () => {
		mockGetUserPredictionHistory.mockRejectedValue(new Error('down'));
		const data = await load(makeEvent(VALID_TOKEN));
		expect(data.goal).not.toBeNull();
		expect(data.history.error).toBeTruthy();
		expect(data.history.records).toEqual([]);
	});
});
