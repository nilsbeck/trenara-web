import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseError } from './errors';
import { GoalShareDAO } from './goal-share';

vi.mock('$lib/server/share/token', () => ({
	generateShareToken: vi.fn(() => 'new-token-0123456789012345678901234567890123')
}));

// ── Mock the supabase client ──────────────────────────────────
//
// One shared chain, in the shape `goal-history.test.ts` already uses:
// every method but the terminals returns the chain itself, `single` and
// `maybeSingle` are separately controllable mocks, and a bare `then` answers
// a chain that ends on `.select(...)` without calling either — the shape
// `revoke` and `refreshSnapshot` use.
const { mockSingle, mockMaybeSingle, mockChain, mockFrom } = vi.hoisted(() => {
	const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null });
	const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

	const mockChain: Record<string, unknown> = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		is: vi.fn().mockReturnThis(),
		update: vi.fn().mockReturnThis(),
		insert: vi.fn().mockReturnThis(),
		single: mockSingle,
		maybeSingle: mockMaybeSingle
	};

	(mockChain as Record<string, unknown>)['then'] = vi.fn(
		(resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
			Promise.resolve({ data: [], error: null }).then(resolve, reject)
	);

	const mockFrom = vi.fn().mockReturnValue(mockChain);
	return { mockSingle, mockMaybeSingle, mockChain, mockFrom };
});

vi.mock('$lib/server/db/client', () => ({
	supabase: { from: mockFrom }
}));

const CHAIN_METHODS = ['select', 'eq', 'is', 'update', 'insert'] as const;

function setThenResult(data: unknown, error: unknown = null) {
	(mockChain as Record<string, unknown>)['then'] = (
		resolve: (v: unknown) => void,
		reject?: (e: unknown) => void
	) => Promise.resolve({ data, error }).then(resolve, reject);
}

const sampleSnapshot = {
	v: 1 as const,
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

const sampleRow = {
	id: 5,
	user_id: 42,
	goal_id: 7,
	token: 'existing-token-012345678901234567890123456',
	title: 'Berlin!',
	display_name: 'Nils',
	snapshot: sampleSnapshot,
	snapshot_at: '2026-08-01T00:00:00Z',
	revoked_at: null,
	created_at: '2026-08-01T00:00:00Z'
};

let dao: GoalShareDAO;

beforeEach(() => {
	dao = GoalShareDAO.getInstance();
	vi.clearAllMocks();
	for (const method of CHAIN_METHODS) {
		(mockChain[method] as ReturnType<typeof vi.fn>).mockReturnValue(mockChain);
	}
	mockFrom.mockReturnValue(mockChain);
	mockSingle.mockResolvedValue({ data: null, error: null });
	mockMaybeSingle.mockResolvedValue({ data: null, error: null });
	setThenResult([]);
});

describe('GoalShareDAO.getForGoal', () => {
	it('returns null when there is no live link', async () => {
		expect(await dao.getForGoal(42, 7)).toBeNull();
	});

	it('scopes the read to the owner and the goal, and only a live row', async () => {
		await dao.getForGoal(42, 7);
		expect(mockFrom).toHaveBeenCalledWith('goal_share');
		expect(mockChain.eq as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('user_id', 42);
		expect(mockChain.eq as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('goal_id', 7);
		expect(mockChain.is as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('revoked_at', null);
	});

	it('returns the row on a hit', async () => {
		mockMaybeSingle.mockResolvedValue({ data: sampleRow, error: null });
		expect(await dao.getForGoal(42, 7)).toEqual(sampleRow);
	});

	it('raises rather than reporting a failed read as no link', async () => {
		mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'down' } });
		await expect(dao.getForGoal(42, 7)).rejects.toBeInstanceOf(DatabaseError);
	});
});

describe('GoalShareDAO.issue', () => {
	it('rotates the token in place when a row already exists', async () => {
		mockMaybeSingle.mockResolvedValueOnce({
			data: { ...sampleRow, token: 'new-token-0123456789012345678901234567890123' },
			error: null
		});

		const result = await dao.issue(42, 7, { title: 'Race day', display_name: 'Nils' });

		expect(result.token).toBe('new-token-0123456789012345678901234567890123');
		expect(mockChain.update as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
			expect.objectContaining({
				token: 'new-token-0123456789012345678901234567890123',
				title: 'Race day',
				display_name: 'Nils',
				revoked_at: null
			})
		);
		// The insert path was never reached.
		expect(mockSingle).not.toHaveBeenCalled();
	});

	it('reactivates a revoked row rather than filtering it out', async () => {
		// The update carries no `revoked_at` filter, unlike every other method
		// here — this is the one case where a revoked row is the row to write.
		mockMaybeSingle.mockResolvedValueOnce({
			data: { ...sampleRow, revoked_at: null },
			error: null
		});

		await dao.issue(42, 7, { title: null, display_name: 'Nils' });

		const eqCalls = (mockChain.eq as ReturnType<typeof vi.fn>).mock.calls;
		expect(eqCalls).toContainEqual(['user_id', 42]);
		expect(eqCalls).toContainEqual(['goal_id', 7]);
		expect(mockChain.is).not.toHaveBeenCalled();
	});

	it('inserts a new row when none exists to rotate', async () => {
		mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
		mockSingle.mockResolvedValueOnce({ data: sampleRow, error: null });

		const result = await dao.issue(42, 7, { title: 'Race day', display_name: 'Nils' });

		expect(result).toEqual(sampleRow);
		expect(mockChain.insert as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
			expect.objectContaining({ user_id: 42, goal_id: 7, title: 'Race day' })
		);
	});

	it('reads back the winning row on a create race rather than failing', async () => {
		mockMaybeSingle
			.mockResolvedValueOnce({ data: null, error: null }) // update: nothing to rotate
			.mockResolvedValueOnce({ data: sampleRow, error: null }); // getForGoal fallback
		mockSingle.mockResolvedValueOnce({
			data: null,
			error: { message: 'duplicate key', code: '23505' }
		});

		const result = await dao.issue(42, 7, { title: null, display_name: null });
		expect(result).toEqual(sampleRow);
	});

	it('raises when the insert fails for a reason other than a race', async () => {
		mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
		mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'down', code: '08006' } });

		await expect(dao.issue(42, 7, { title: null, display_name: null })).rejects.toBeInstanceOf(
			DatabaseError
		);
	});

	it('raises rather than reporting a failed update as nothing to rotate', async () => {
		mockMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'down' } });
		await expect(dao.issue(42, 7, { title: null, display_name: null })).rejects.toBeInstanceOf(
			DatabaseError
		);
	});
});

describe('GoalShareDAO.revoke', () => {
	it('clears the snapshot alongside the revoked mark', async () => {
		setThenResult([{ id: 5 }]);
		await dao.revoke(42, 7);
		expect(mockChain.update as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
			expect.objectContaining({ snapshot: null, snapshot_at: null })
		);
		expect((mockChain.update as ReturnType<typeof vi.fn>).mock.calls[0][0].revoked_at).toEqual(
			expect.any(String)
		);
	});

	it('scopes to the owner, the goal, and a row that is still live', async () => {
		setThenResult([{ id: 5 }]);
		await dao.revoke(42, 7);
		expect(mockChain.eq as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('user_id', 42);
		expect(mockChain.eq as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('goal_id', 7);
		expect(mockChain.is as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('revoked_at', null);
	});

	it('reports revoked when a row was live to revoke', async () => {
		setThenResult([{ id: 5 }]);
		expect(await dao.revoke(42, 7)).toEqual({ revoked: true });
	});

	it('is idempotent: revoking an already-revoked or missing link matches nothing', async () => {
		setThenResult([]);
		expect(await dao.revoke(42, 7)).toEqual({ revoked: false });
	});

	it('raises rather than reporting a failed write as a no-op', async () => {
		setThenResult(null, { message: 'down' });
		await expect(dao.revoke(42, 7)).rejects.toBeInstanceOf(DatabaseError);
	});
});

describe('GoalShareDAO.refreshSnapshot', () => {
	it('writes the snapshot and a fresh timestamp for a live link', async () => {
		setThenResult([{ id: 5 }]);
		const result = await dao.refreshSnapshot(42, 7, sampleSnapshot);
		expect(result).toEqual({ written: true });
		expect(mockChain.update as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
			expect.objectContaining({ snapshot: sampleSnapshot, snapshot_at: expect.any(String) })
		);
	});

	it('never writes past a revoked link', async () => {
		setThenResult([{ id: 5 }]);
		await dao.refreshSnapshot(42, 7, sampleSnapshot);
		expect(mockChain.is as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('revoked_at', null);
	});

	it('reports not written when there is no live link for this goal', async () => {
		setThenResult([]);
		expect(await dao.refreshSnapshot(42, 7, sampleSnapshot)).toEqual({ written: false });
	});

	it('raises rather than reporting a failed write as nothing to do', async () => {
		setThenResult(null, { message: 'down' });
		await expect(dao.refreshSnapshot(42, 7, sampleSnapshot)).rejects.toBeInstanceOf(DatabaseError);
	});
});

describe('GoalShareDAO.getLiveByToken', () => {
	it('returns null for a token that does not exist', async () => {
		expect(await dao.getLiveByToken('nope')).toBeNull();
	});

	it('carries no user_id filter — the token alone is the scope', async () => {
		await dao.getLiveByToken('some-token');
		expect(mockChain.eq as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('token', 'some-token');
		expect(mockChain.eq as ReturnType<typeof vi.fn>).not.toHaveBeenCalledWith(
			'user_id',
			expect.anything()
		);
		expect(mockChain.is as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('revoked_at', null);
	});

	it('answers a revoked token exactly as it answers an unknown one', async () => {
		// The row is filtered out by `.is('revoked_at', null)` at the query
		// level, so the mock simply has nothing to return — same as "unknown".
		mockMaybeSingle.mockResolvedValue({ data: null, error: null });
		expect(await dao.getLiveByToken(sampleRow.token)).toBeNull();
	});

	it('returns the public columns on a hit', async () => {
		mockMaybeSingle.mockResolvedValue({ data: sampleRow, error: null });
		expect(await dao.getLiveByToken(sampleRow.token)).toEqual(sampleRow);
	});

	it('raises rather than reporting a failed read as an unknown token', async () => {
		mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'down' } });
		await expect(dao.getLiveByToken('some-token')).rejects.toBeInstanceOf(DatabaseError);
	});
});
