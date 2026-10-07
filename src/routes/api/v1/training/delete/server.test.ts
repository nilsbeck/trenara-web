import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isHttpError, type Cookies } from '@sveltejs/kit';
import { HttpError } from '$lib/server/trenara/client';
import { DELETE } from './+server';

const mockDeleteEntry = vi.fn();
const mockTestRemove = vi.fn();
const mockSaveRemove = vi.fn();

vi.mock('$lib/server/trenara', () => ({
	trainingApi: {
		deleteTraining: (...args: unknown[]) => mockDeleteEntry(...args),
		testRemoveTraining: (...args: unknown[]) => mockTestRemove(...args),
		saveRemoveTraining: (...args: unknown[]) => mockSaveRemove(...args)
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
	mockTestRemove.mockResolvedValue({ goal_possible: true, new_goal_time: 9855 });
	mockSaveRemove.mockResolvedValue({ id: 39515460, trainings: [] });
});

describe('DELETE /api/v1/training/delete', () => {
	it('deletes a filed entry when no kind is named', async () => {
		const res = await DELETE(event({ trainingId: 7 }));
		expect(mockDeleteEntry).toHaveBeenCalledWith(cookies, 7);
		expect(mockSaveRemove).not.toHaveBeenCalled();
		expect(await res.json()).toEqual({ deleted: 'entry' });
	});

	// The mobile app's removal, captured 2026-10-07: the dry run, then the save.
	it('removes a scheduled training with the destroy dry run, then the save', async () => {
		const res = await DELETE(event({ trainingId: 7, type: 'scheduled' }));
		expect(mockTestRemove).toHaveBeenCalledWith(cookies, 7, false);
		expect(mockSaveRemove).toHaveBeenCalledWith(cookies, 7, false);
		expect(mockTestRemove.mock.invocationCallOrder[0]).toBeLessThan(
			mockSaveRemove.mock.invocationCallOrder[0]
		);
		expect(mockDeleteEntry).not.toHaveBeenCalled();
		// The week the save answered with, which the client may seat.
		expect(await res.json()).toEqual({ id: 39515460, trainings: [] });
	});

	it('saves nothing when the dry run is refused', async () => {
		mockTestRemove.mockRejectedValue(new HttpError('No result found', 404));
		const { status } = await refusal(DELETE(event({ trainingId: 7, type: 'scheduled' })));
		expect(status).toBe(404);
		expect(mockSaveRemove).not.toHaveBeenCalled();
	});

	it.each([
		['a missing id', {}, 'trainingId'],
		['an unknown kind', { trainingId: 7, type: 'strength' }, 'type']
	])('refuses %s and names the field', async (_label, body, field) => {
		const { status, message } = await refusal(DELETE(event(body)));
		expect(status).toBe(400);
		expect(message).toContain(field);
		expect(mockDeleteEntry).not.toHaveBeenCalled();
		expect(mockTestRemove).not.toHaveBeenCalled();
		expect(mockSaveRemove).not.toHaveBeenCalled();
	});

	it("passes Trenara's refusal through with its own status", async () => {
		mockSaveRemove.mockRejectedValue(new HttpError('No result found', 404));
		const { status } = await refusal(DELETE(event({ trainingId: 7, type: 'scheduled' })));
		expect(status).toBe(404);
	});
});
