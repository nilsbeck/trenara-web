import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isHttpError, type Cookies } from '@sveltejs/kit';
import { HttpError } from '$lib/server/trenara/client';
import { POST } from './+server';

const mockSend = vi.fn();

vi.mock('$lib/server/trenara', () => ({
	chatApi: {
		getMessages: vi.fn(),
		sendMessage: (...args: unknown[]) => mockSend(...args)
	}
}));

const cookies = {} as Cookies;

function event(id: string, body: unknown) {
	return { params: { id }, request: { json: async () => body }, cookies } as never;
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
	mockSend.mockResolvedValue({ id: 101, content: 'Easy run today?' });
});

describe('POST /api/v1/chat/threads/[id]/messages', () => {
	it('sends the message exactly as typed', async () => {
		const res = await POST(event('3', { content: ' Easy run today? ' }));
		expect(mockSend).toHaveBeenCalledWith(cookies, 3, ' Easy run today? ');
		expect(await res.json()).toEqual({ id: 101, content: 'Easy run today?' });
	});

	it('refuses a blank message and names the field', async () => {
		const { status, message } = await refusal(POST(event('3', { content: '   ' })));
		expect(status).toBe(400);
		expect(message).toContain('content');
		expect(mockSend).not.toHaveBeenCalled();
	});

	it('refuses a thread id that is not a number', async () => {
		const { status } = await refusal(POST(event('abc', { content: 'Hi' })));
		expect(status).toBe(400);
		expect(mockSend).not.toHaveBeenCalled();
	});

	it("passes Trenara's refusal through with its own status", async () => {
		mockSend.mockRejectedValue(new HttpError('Forbidden', 403));
		const { status } = await refusal(POST(event('3', { content: 'Hi' })));
		expect(status).toBe(403);
	});
});
