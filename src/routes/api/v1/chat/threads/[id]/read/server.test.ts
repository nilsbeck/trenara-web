import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isHttpError, type Cookies } from '@sveltejs/kit';
import { POST } from './+server';

const mockGetThreads = vi.fn();
const mockAdvance = vi.fn();
const mockCheck = vi.fn();

vi.mock('$lib/server/trenara', () => ({
	chatApi: { getThreads: (...args: unknown[]) => mockGetThreads(...args) }
}));

vi.mock('$lib/server/db/chat-read-state', () => ({
	chatReadStateDAO: { advanceMark: (...args: unknown[]) => mockAdvance(...args) }
}));

vi.mock('$lib/server/security/rate-limit', () => ({
	storageWrites: { check: (...args: unknown[]) => mockCheck(...args) }
}));

const user = { id: 42, email: 'runner@example.com' };

function event(id: string, body: unknown, locals: { user: typeof user | null } = { user }) {
	return {
		params: { id },
		request: { json: async () => body },
		cookies: {} as Cookies,
		locals
	} as never;
}

async function refusal(run: unknown): Promise<{ status: number; message: string }> {
	try {
		await run;
	} catch (e) {
		if (isHttpError(e)) return { status: e.status, message: e.body.message };
		throw e;
	}
	throw new Error('expected the handler to refuse');
}

beforeEach(() => {
	vi.clearAllMocks();
	mockCheck.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
	mockGetThreads.mockResolvedValue([{ id: 3 }]);
	mockAdvance.mockResolvedValue({ advanced: true });
});

describe('POST /api/v1/chat/threads/[id]/read', () => {
	it("advances the reader's own mark", async () => {
		const res = await POST(event('3', { lastSeenMessageId: 101 }));
		expect(mockAdvance).toHaveBeenCalledWith(42, 3, 101);
		expect(await res.json()).toEqual({ advanced: true });
	});

	it('requires a session', async () => {
		const { status } = await refusal(POST(event('3', { lastSeenMessageId: 1 }, { user: null })));
		expect(status).toBe(401);
		expect(mockAdvance).not.toHaveBeenCalled();
	});

	it.each([
		['a negative id', { lastSeenMessageId: -1 }, 'lastSeenMessageId'],
		['a numeric string', { lastSeenMessageId: '101' }, 'lastSeenMessageId'],
		['a body that is not JSON', null, 'body']
	])('refuses %s and names what was wrong', async (_label, body, field) => {
		const { status, message } = await refusal(POST(event('3', body)));
		expect(status).toBe(400);
		expect(message).toContain(field);
		expect(mockAdvance).not.toHaveBeenCalled();
	});

	it('refuses a thread that is not the reader’s own, without writing', async () => {
		const { status } = await refusal(POST(event('9', { lastSeenMessageId: 1 })));
		expect(status).toBe(404);
		expect(mockAdvance).not.toHaveBeenCalled();
	});
});
