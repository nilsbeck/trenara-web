import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseError } from './errors';
import { NewsReadStateDAO } from './news-read-state';

// ── Mock the supabase client ──────────────────────────────────
//
// Three chains to tell apart:
//
//   read    →  .select(…).eq(…).maybeSingle()
//   advance →  .update(…).eq(…).or(…).select(…)   awaited
//   advance →  .insert(…)                         awaited
//
// `or` is captured because the ordering that used to live in `isNewer` is now
// the update's `WHERE` clause, and that is the thing worth asserting on.
const { mockMaybeSingle, mockFrom, mockInsert, captured, state } = vi.hoisted(() => {
	const state = {
		updateResult: { data: [] as unknown[], error: null as { message: string } | null },
		insertResult: { error: null as { message: string; code?: string } | null }
	};

	const captured = { update: null as unknown, insert: null as unknown, or: null as string | null };

	const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
	const mockInsert = vi.fn();

	const mockFrom = vi.fn(() => {
		const chain: Record<string, unknown> = {
			select: vi.fn(() => chain),
			eq: vi.fn(() => chain),
			maybeSingle: mockMaybeSingle,
			update: vi.fn((values: unknown) => {
				captured.update = values;
				return chain;
			}),
			or: vi.fn((filter: string) => {
				captured.or = filter;
				return chain;
			}),
			insert: vi.fn((values: unknown) => {
				captured.insert = values;
				mockInsert(values);
				return Promise.resolve(state.insertResult);
			}),
			then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
				Promise.resolve(state.updateResult).then(resolve, reject)
		};

		return chain;
	});

	return { mockMaybeSingle, mockFrom, mockInsert, captured, state };
});

vi.mock('$lib/server/db/client', () => ({
	supabase: { from: mockFrom }
}));

const dao = NewsReadStateDAO.getInstance();

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	mockMaybeSingle.mockResolvedValue({ data: null, error: null });
	state.updateResult = { data: [], error: null };
	state.insertResult = { error: null };
	captured.update = null;
	captured.insert = null;
	captured.or = null;
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('NewsReadStateDAO.getMark', () => {
	it('returns null when the reader has no mark yet', async () => {
		expect(await dao.getMark(7)).toBeNull();
	});

	it('maps the stored row onto a mark', async () => {
		mockMaybeSingle.mockResolvedValue({
			data: { last_seen_id: 82, last_seen_created_at: 1_750_000_000 },
			error: null
		});

		expect(await dao.getMark(7)).toEqual({ id: 82, createdAt: 1_750_000_000 });
		expect(mockFrom).toHaveBeenCalledWith('news_read_state');
	});

	it('returns null when the query fails, rather than a badge nobody can justify', async () => {
		mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'down' } });
		expect(await dao.getMark(7)).toBeNull();
	});
});

describe('NewsReadStateDAO.advanceMark', () => {
	it('inserts the first mark for a reader who has none', async () => {
		const result = await dao.advanceMark(7, { id: 82, createdAt: 1_750_000_000 });

		expect(result).toEqual({ advanced: true });
		expect(captured.insert).toEqual(
			expect.objectContaining({
				user_id: 7,
				last_seen_id: 82,
				last_seen_created_at: 1_750_000_000
			})
		);
	});

	it('moves a mark forward with one conditional update', async () => {
		state.updateResult = { data: [{ user_id: 7 }], error: null };

		expect(await dao.advanceMark(7, { id: 82, createdAt: 1_750_000_000 })).toEqual({
			advanced: true
		});
		expect(mockInsert).not.toHaveBeenCalled();
	});

	// `created_at` decides, because that is what the feed is ordered by; the id
	// only breaks ties inside the same second. That ordering is the update's
	// `WHERE` clause now, so this is where it gets checked.
	it('asks the database for the same ordering isNewer describes', async () => {
		state.updateResult = { data: [{ user_id: 7 }], error: null };

		await dao.advanceMark(7, { id: 82, createdAt: 1_750_000_000 });

		expect(captured.or).toBe(
			'last_seen_created_at.lt.1750000000,' +
				'and(last_seen_created_at.eq.1750000000,last_seen_id.lt.82)'
		);
	});

	// A stale tab must not un-read newer items: nothing matches the update, and
	// the insert conflicts with the row that is already there.
	it('ignores a mark that is not newer', async () => {
		state.updateResult = { data: [], error: null };
		state.insertResult = { error: { message: 'duplicate key', code: '23505' } };

		expect(await dao.advanceMark(7, { id: 80, createdAt: 1_749_000_000 })).toEqual({
			advanced: false
		});
	});

	// The test above returns `{ advanced: false }` for a mark that was already
	// far enough along — a correct no-op. A failed write returning the very
	// same thing left the badge to reappear next load with nothing to explain
	// it, so the two answers are no longer the same answer.
	it('raises rather than reporting a failed write as a no-op', async () => {
		state.updateResult = { data: null as unknown as unknown[], error: { message: 'down' } };
		await expect(dao.advanceMark(7, { id: 82, createdAt: 1_750_000_000 })).rejects.toBeInstanceOf(
			DatabaseError
		);
	});

	it('raises when the insert fails for a reason other than a conflict', async () => {
		state.insertResult = { error: { message: 'down', code: '08006' } };

		await expect(dao.advanceMark(7, { id: 82, createdAt: 1_750_000_000 })).rejects.toBeInstanceOf(
			DatabaseError
		);
	});
});
