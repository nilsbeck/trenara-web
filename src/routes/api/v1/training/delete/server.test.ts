import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isHttpError, type Cookies } from '@sveltejs/kit';
import { HttpError } from '$lib/server/trenara/client';
import { DELETE } from './+server';

const mockDeleteEntry = vi.fn();
const mockDeleteScheduled = vi.fn();

vi.mock('$lib/server/trenara', () => ({
	trainingApi: {
		deleteTraining: (...args: unknown[]) => mockDeleteEntry(...args),
		deleteScheduledTraining: (...args: unknown[]) => mockDeleteScheduled(...args)
	}
}));

const cookies = {} as Cookies;

function event(body: unknown) {
	return { request: { json: async () => body }, cookies } as never;
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
	mockDeleteEntry.mockResolvedValue({ deleted: 'entry' });
	mockDeleteScheduled.mockResolvedValue({ deleted: 'scheduled' });
});

describe('DELETE /api/v1/training/delete', () => {
	it('deletes a filed entry when no kind is named', async () => {
		const res = await DELETE(event({ trainingId: 7 }));
		expect(mockDeleteEntry).toHaveBeenCalledWith(cookies, 7);
		expect(mockDeleteScheduled).not.toHaveBeenCalled();
		expect(await res.json()).toEqual({ deleted: 'entry' });
	});

	it('deletes from the plan when the training is scheduled', async () => {
		await DELETE(event({ trainingId: 7, type: 'scheduled' }));
		expect(mockDeleteScheduled).toHaveBeenCalledWith(cookies, 7);
		expect(mockDeleteEntry).not.toHaveBeenCalled();
	});

	it.each([
		['a missing id', {}, 'trainingId'],
		['an unknown kind', { trainingId: 7, type: 'strength' }, 'type']
	])('refuses %s and names the field', async (_label, body, field) => {
		const { status, message } = await refusal(DELETE(event(body)));
		expect(status).toBe(400);
		expect(message).toContain(field);
		expect(mockDeleteEntry).not.toHaveBeenCalled();
		expect(mockDeleteScheduled).not.toHaveBeenCalled();
	});

	it("passes Trenara's refusal through with its own status", async () => {
		mockDeleteScheduled.mockRejectedValue(new HttpError('No result found', 404));
		const { status } = await refusal(DELETE(event({ trainingId: 7, type: 'scheduled' })));
		expect(status).toBe(404);
	});
});
