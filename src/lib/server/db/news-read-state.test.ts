import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseError } from './errors';
import { NewsReadStateDAO } from './news-read-state';

// ── Mock the supabase client ──────────────────────────────────
const { mockMaybeSingle, mockUpsert, mockFrom, state } = vi.hoisted(() => {
	const state = {
		upsertResult: { error: null } as { error: { message: string } | null }
	};

	const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
	const mockUpsert = vi.fn(() => Promise.resolve(state.upsertResult));

	const chain: Record<string, unknown> = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		maybeSingle: mockMaybeSingle,
		upsert: mockUpsert
	};

	const mockFrom = vi.fn().mockReturnValue(chain);
	return { mockMaybeSingle, mockUpsert, mockFrom, state };
});

vi.mock('$lib/server/db/client', () => ({
	supabase: { from: mockFrom }
}));

const dao = NewsReadStateDAO.getInstance();

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	mockMaybeSingle.mockResolvedValue({ data: null, error: null });
	state.upsertResult = { error: null };
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
	it('writes the first mark for a reader who has none', async () => {
		const result = await dao.advanceMark(7, { id: 82, createdAt: 1_750_000_000 });

		expect(result).toEqual({ advanced: true });
		expect(mockUpsert).toHaveBeenCalledWith(
			expect.objectContaining({
				user_id: 7,
				last_seen_id: 82,
				last_seen_created_at: 1_750_000_000
			}),
			{ onConflict: 'user_id' }
		);
	});

	it('moves a mark forward', async () => {
		mockMaybeSingle.mockResolvedValue({
			data: { last_seen_id: 80, last_seen_created_at: 1_749_000_000 },
			error: null
		});

		expect(await dao.advanceMark(7, { id: 82, createdAt: 1_750_000_000 })).toEqual({
			advanced: true
		});
	});

	it('ignores an older mark, so a stale tab cannot un-read newer items', async () => {
		mockMaybeSingle.mockResolvedValue({
			data: { last_seen_id: 82, last_seen_created_at: 1_750_000_000 },
			error: null
		});

		expect(await dao.advanceMark(7, { id: 80, createdAt: 1_749_000_000 })).toEqual({
			advanced: false
		});
		expect(mockUpsert).not.toHaveBeenCalled();
	});

	it('ignores a mark the reader already has', async () => {
		mockMaybeSingle.mockResolvedValue({
			data: { last_seen_id: 82, last_seen_created_at: 1_750_000_000 },
			error: null
		});

		expect(await dao.advanceMark(7, { id: 82, createdAt: 1_750_000_000 })).toEqual({
			advanced: false
		});
		expect(mockUpsert).not.toHaveBeenCalled();
	});

	// The test above returns `{ advanced: false }` for a mark that was already
	// far enough along — a correct no-op. A failed write returning the very
	// same thing left the badge to reappear next load with nothing to explain
	// it, so the two answers are no longer the same answer.
	it('raises rather than reporting a failed write as a no-op', async () => {
		state.upsertResult = { error: { message: 'down' } };
		await expect(dao.advanceMark(7, { id: 82, createdAt: 1_750_000_000 })).rejects.toBeInstanceOf(
			DatabaseError
		);
	});
});
