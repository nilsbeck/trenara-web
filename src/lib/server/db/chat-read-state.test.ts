import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseError } from './errors';
import { ChatReadStateDAO } from './chat-read-state';

// ── Mock the supabase client ──────────────────────────────────
//
// The DAO builds two different chains and the mock has to tell them apart:
//
//   read    →  .select(…).eq(…)                          awaited
//   advance →  .update(…).eq(…).eq(…).lt(…).select(…)    awaited
//   advance →  .insert(…)                                awaited
//
// so the builder records which entry method started the chain and resolves to
// the matching fixture. `lt` is captured because it is where the monotonicity
// now lives — the comparison the DAO used to do in JavaScript.
const { mockFrom, mockInsert, captured, state } = vi.hoisted(() => {
	const state = {
		selectResult: { data: [] as unknown, error: null as { message: string } | null },
		updateResult: { data: [] as unknown[], error: null as { message: string } | null },
		insertResult: { error: null as { message: string; code?: string } | null }
	};

	const captured = {
		update: null as unknown,
		insert: null as unknown,
		lt: null as [string, unknown] | null
	};

	const mockInsert = vi.fn();

	const mockFrom = vi.fn(() => {
		let op: 'select' | 'update' = 'select';

		const chain: Record<string, unknown> = {
			select: vi.fn(() => chain),
			eq: vi.fn(() => chain),
			update: vi.fn((values: unknown) => {
				op = 'update';
				captured.update = values;
				return chain;
			}),
			lt: vi.fn((column: string, value: unknown) => {
				captured.lt = [column, value];
				return chain;
			}),
			insert: vi.fn((values: unknown) => {
				captured.insert = values;
				mockInsert(values);
				return Promise.resolve(state.insertResult);
			}),
			then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
				Promise.resolve(op === 'update' ? state.updateResult : state.selectResult).then(
					resolve,
					reject
				)
		};

		return chain;
	});

	return { mockFrom, mockInsert, captured, state };
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
	state.updateResult = { data: [], error: null };
	state.insertResult = { error: null };
	captured.update = null;
	captured.insert = null;
	captured.lt = null;
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
	it('inserts the position for a thread with no mark yet', async () => {
		// No row matched the conditional update, and the insert succeeds.
		expect(await dao.advanceMark(USER, 1, 101)).toEqual({ advanced: true });
		expect(captured.insert).toEqual(
			expect.objectContaining({ user_id: USER, thread_id: 1, last_seen_message_id: 101 })
		);
	});

	it('moves an existing mark forward with one conditional update', async () => {
		state.updateResult = { data: [{ thread_id: 1 }], error: null };

		expect(await dao.advanceMark(USER, 1, 101)).toEqual({ advanced: true });
		expect(captured.update).toEqual(expect.objectContaining({ last_seen_message_id: 101 }));
		// The comparison is the statement's, not the caller's.
		expect(captured.lt).toEqual(['last_seen_message_id', 101]);
		expect(mockInsert).not.toHaveBeenCalled();
	});

	// A tab left open on an older page of the conversation must not un-read what
	// has arrived since. The update matches nothing and the insert conflicts.
	it('ignores a position that is not newer', async () => {
		state.updateResult = { data: [], error: null };
		state.insertResult = { error: { message: 'duplicate key', code: '23505' } };

		expect(await dao.advanceMark(USER, 1, 90)).toEqual({ advanced: false });
	});

	// `{ advanced: false }` is what a mark already far enough along returns — a
	// correct no-op. A failed write answering the same way made the two
	// indistinguishable to everything downstream.
	it('raises rather than reporting a failed update as a no-op', async () => {
		state.updateResult = { data: null as unknown as unknown[], error: { message: 'boom' } };

		await expect(dao.advanceMark(USER, 1, 101)).rejects.toBeInstanceOf(DatabaseError);
	});

	it('raises when the insert fails for a reason other than a conflict', async () => {
		state.insertResult = { error: { message: 'boom', code: '08006' } };

		await expect(dao.advanceMark(USER, 1, 101)).rejects.toBeInstanceOf(DatabaseError);
	});
});
