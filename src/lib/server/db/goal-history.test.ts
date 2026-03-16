import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoalHistoryDAO } from './goal-history';

// ── Mock the supabase client ──────────────────────────────────
const { mockSingle, mockChain, mockFrom } = vi.hoisted(() => {
	const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null });

	const mockChain: Record<string, unknown> = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		upsert: vi.fn().mockReturnThis(),
		single: mockSingle
	};

	// Make the chain awaitable for queries that don't call .single()
	(mockChain as Record<string, unknown>)['then'] = vi.fn(
		(resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
			Promise.resolve({ data: [], error: null }).then(resolve, reject)
	);

	const mockFrom = vi.fn().mockReturnValue(mockChain);
	return { mockSingle, mockChain, mockFrom };
});

vi.mock('$lib/server/db/client', () => ({
	supabase: { from: mockFrom }
}));

const CHAIN_METHODS = ['select', 'eq', 'order', 'upsert'] as const;

function setThenResult(data: unknown, error: unknown = null) {
	(mockChain as Record<string, unknown>)['then'] = (
		resolve: (v: unknown) => void,
		reject?: (e: unknown) => void
	) => Promise.resolve({ data, error }).then(resolve, reject);
}

const sampleGoal = {
	goal_name: 'Marathon Berlin',
	distance: '42.195 km',
	goal_time: '3:45:00',
	goal_pace: '5:20',
	final_predicted_time: '3:42:00',
	final_predicted_pace: '5:16',
	start_date: '2025-01-06',
	end_date: '2025-09-28'
};

const sampleRecord = {
	id: 1,
	user_id: 42,
	...sampleGoal,
	archived_at: '2025-09-28T12:00:00Z'
};

// ─────────────────────────────────────────────────────────────
// GoalHistoryDAO — getGoalHistory
// ─────────────────────────────────────────────────────────────
describe('GoalHistoryDAO.getGoalHistory', () => {
	let dao: GoalHistoryDAO;

	beforeEach(() => {
		dao = GoalHistoryDAO.getInstance();
		vi.clearAllMocks();
		for (const method of CHAIN_METHODS) {
			(mockChain[method] as ReturnType<typeof vi.fn>).mockReturnValue(mockChain);
		}
		mockFrom.mockReturnValue(mockChain);
		setThenResult([]);
	});

	it('returns an empty array when no records exist', async () => {
		setThenResult([]);
		const records = await dao.getGoalHistory(42);
		expect(records).toEqual([]);
	});

	it('queries the goal_history table for the given user', async () => {
		setThenResult([]);
		await dao.getGoalHistory(42);
		expect(mockFrom).toHaveBeenCalledWith('goal_history');
		expect((mockChain.eq as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('user_id', 42);
	});

	it('orders results by end_date descending', async () => {
		setThenResult([]);
		await dao.getGoalHistory(42);
		expect((mockChain.order as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('end_date', { ascending: false });
	});

	it('returns records on success', async () => {
		const records = [sampleRecord, { ...sampleRecord, id: 2, goal_name: '10km Race', end_date: '2025-04-15' }];
		setThenResult(records);
		const result = await dao.getGoalHistory(42);
		expect(result).toHaveLength(2);
		expect(result[0].goal_name).toBe('Marathon Berlin');
	});

	it('returns empty array on supabase error', async () => {
		setThenResult(null, new Error('DB error'));
		const records = await dao.getGoalHistory(42);
		expect(records).toEqual([]);
	});

	it('returns empty array when data is null without error', async () => {
		setThenResult(null, null);
		const records = await dao.getGoalHistory(42);
		expect(records).toEqual([]);
	});
});

// ─────────────────────────────────────────────────────────────
// GoalHistoryDAO — archiveGoal
// ─────────────────────────────────────────────────────────────
describe('GoalHistoryDAO.archiveGoal', () => {
	let dao: GoalHistoryDAO;

	beforeEach(() => {
		dao = GoalHistoryDAO.getInstance();
		vi.clearAllMocks();
		for (const method of CHAIN_METHODS) {
			(mockChain[method] as ReturnType<typeof vi.fn>).mockReturnValue(mockChain);
		}
		mockFrom.mockReturnValue(mockChain);
		mockSingle.mockResolvedValue({ data: null, error: null });
	});

	it('upserts with the correct conflict key', async () => {
		mockSingle.mockResolvedValueOnce({ data: sampleRecord, error: null });
		await dao.archiveGoal(42, sampleGoal);
		expect((mockChain.upsert as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
			expect.objectContaining({
				user_id: 42,
				goal_name: 'Marathon Berlin',
				end_date: '2025-09-28'
			}),
			{ onConflict: 'user_id,goal_name,end_date' }
		);
	});

	it('returns stored=true with the record on success', async () => {
		mockSingle.mockResolvedValueOnce({ data: sampleRecord, error: null });
		const result = await dao.archiveGoal(42, sampleGoal);
		expect(result.stored).toBe(true);
		expect(result.record).toMatchObject({ goal_name: 'Marathon Berlin', goal_time: '3:45:00' });
	});

	it('returns stored=false on upsert failure', async () => {
		mockSingle.mockResolvedValueOnce({ data: null, error: new Error('Constraint violation') });
		const result = await dao.archiveGoal(42, sampleGoal);
		expect(result.stored).toBe(false);
		expect(result.record).toBeUndefined();
	});

	it('handles null predicted values gracefully', async () => {
		const goalWithoutPrediction = {
			...sampleGoal,
			final_predicted_time: null,
			final_predicted_pace: null
		};
		mockSingle.mockResolvedValueOnce({
			data: { ...sampleRecord, final_predicted_time: null, final_predicted_pace: null },
			error: null
		});
		const result = await dao.archiveGoal(42, goalWithoutPrediction);
		expect(result.stored).toBe(true);
		expect((mockChain.upsert as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
			expect.objectContaining({
				final_predicted_time: null,
				final_predicted_pace: null
			}),
			expect.any(Object)
		);
	});
});
