import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isHttpError, type Cookies } from '@sveltejs/kit';
import { HttpError } from '$lib/server/trenara/client';
import { PUT } from './+server';

const mockTest = vi.fn();
const mockSave = vi.fn();

vi.mock('$lib/server/trenara', () => ({
	trainingApi: {
		testChangeDate: (...args: unknown[]) => mockTest(...args),
		saveChangeDate: (...args: unknown[]) => mockSave(...args)
	}
}));

const cookies = {} as Cookies;

function event(body: unknown) {
	return { request: { json: async () => body }, cookies } as never;
}

/** The status a handler refused with, via SvelteKit's `error()`. */
async function refusal(run: unknown): Promise<{ status: number; message: string }> {
	try {
		await run;
	} catch (e) {
		if (isHttpError(e)) return { status: e.status, message: e.body.message };
		throw e;
	}
	throw new Error('expected the handler to refuse');
}

const move = { entryId: 42, newDate: '2026-09-28', includeFuture: true };

beforeEach(() => {
	vi.clearAllMocks();
	mockTest.mockResolvedValue({ preview: true });
	mockSave.mockResolvedValue({ saved: true });
});

describe('PUT /api/v1/training/move', () => {
	it('saves by default', async () => {
		const res = await PUT(event(move));
		expect(mockSave).toHaveBeenCalledWith(cookies, 42, '2026-09-28', true);
		expect(mockTest).not.toHaveBeenCalled();
		expect(await res.json()).toEqual({ saved: true });
	});

	it('only previews when asked to test', async () => {
		const res = await PUT(event({ ...move, action: 'test' }));
		expect(mockTest).toHaveBeenCalledWith(cookies, 42, '2026-09-28', true);
		expect(mockSave).not.toHaveBeenCalled();
		expect(await res.json()).toEqual({ preview: true });
	});

	it('names the field that was wrong, rather than that something was', async () => {
		const { status, message } = await refusal(PUT(event({ ...move, entryId: 'x' })));
		expect(status).toBe(400);
		expect(message).toContain('entryId');
		expect(mockSave).not.toHaveBeenCalled();
	});

	it("passes Trenara's refusal through with its own status", async () => {
		mockSave.mockRejectedValue(new HttpError('This training can not be moved', 422));
		const { status, message } = await refusal(PUT(event(move)));
		expect(status).toBe(422);
		expect(message).toBe('This training can not be moved');
	});
});
