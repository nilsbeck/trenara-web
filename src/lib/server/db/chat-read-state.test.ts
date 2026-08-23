import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatReadStateDAO } from './chat-read-state';

// ── Mock the supabase client ──────────────────────────────────
const { mockUpsert, mockFrom, state } = vi.hoisted(() => {
	const state = {
		selectResult: { data: [] as unknown, error: null as { message: string } | null },
		upsertResult: { error: null } as { error: { message: string } | null }
	};

	const mockEq = vi.fn(() => Promise.resolve(state.selectResult));
	const mockUpsert = vi.fn(() => Promise.resolve(state.upsertResult));

	const chain: Record<string, unknown> = {
		select: vi.fn().mockReturnThis(),
		eq: mockEq,
		upsert: mockUpsert
	};

	const mockFrom = vi.fn().mockReturnValue(chain);
	return { mockUpsert, mockFrom, state };
});

vi.mock('$lib/server/db/client', () => ({
	supabase: { from: mockFrom }
}));

const dao = ChatReadStateDAO.getInstance();
const USER = 56540;

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	state.selectResult = { data: [], error: null };
	state.upsertResult = { error: null };
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('ChatReadStateDAO.getMarks', () => {
	it('is empty for a reader with no marks', async () => {
		expect((await dao.getMarks(USER)).size).toBe(0);
	});

	it('keys the stored positions by thread', async () => {
		state.selectResult = {
			data: [
				{ thread_id: 1, last_seen_message_id: 90 },
				{ thread_id: 2, last_seen_message_id: 12 }
			],
			error: null
		};

		const marks = await dao.getMarks(USER);

		expect(marks.get(1)).toBe(90);
		expect(marks.get(2)).toBe(12);
	});

	// The count itself still comes from Trenara, so an unreadable mark costs at
	// most a badge for something already read — better than hiding a reply.
	it('reads a database failure as no marks', async () => {
		state.selectResult = { data: null, error: { message: 'boom' } };

		expect((await dao.getMarks(USER)).size).toBe(0);
	});
});

describe('ChatReadStateDAO.advanceMark', () => {
	it('stores the position for a thread with no mark yet', async () => {
		expect(await dao.advanceMark(USER, 1, 101)).toEqual({ advanced: true });
		expect(mockUpsert).toHaveBeenCalledWith(
			expect.objectContaining({ user_id: USER, thread_id: 1, last_seen_message_id: 101 }),
			{ onConflict: 'user_id,thread_id' }
		);
	});

	it('moves an existing mark forward', async () => {
		state.selectResult = { data: [{ thread_id: 1, last_seen_message_id: 90 }], error: null };

		expect(await dao.advanceMark(USER, 1, 101)).toEqual({ advanced: true });
	});

	// A tab left open on an older page of the conversation must not un-read what
	// has arrived since.
	it('ignores a position that is not newer', async () => {
		state.selectResult = { data: [{ thread_id: 1, last_seen_message_id: 101 }], error: null };

		expect(await dao.advanceMark(USER, 1, 90)).toEqual({ advanced: false });
		expect(await dao.advanceMark(USER, 1, 101)).toEqual({ advanced: false });
		expect(mockUpsert).not.toHaveBeenCalled();
	});

	it('reports a failed write rather than throwing', async () => {
		state.upsertResult = { error: { message: 'boom' } };

		expect(await dao.advanceMark(USER, 1, 101)).toEqual({ advanced: false });
	});
});
