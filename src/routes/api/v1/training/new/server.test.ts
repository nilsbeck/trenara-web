import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isHttpError, type Cookies } from '@sveltejs/kit';
import { HttpError } from '$lib/server/trenara/client';
import { GET, POST } from './+server';

const mockWeek = vi.fn();
const mockList = vi.fn();
const mockAdd = vi.fn();

vi.mock('$lib/server/trenara', () => ({
	trainingApi: {
		getSchedule: (...args: unknown[]) => mockWeek(...args),
		getNewTrainings: (...args: unknown[]) => mockList(...args),
		addNewTraining: (...args: unknown[]) => mockAdd(...args)
	}
}));

const cookies = {} as Cookies;

function getEvent(date: string | null) {
	const url = new URL('http://localhost/api/v1/training/new');
	if (date !== null) url.searchParams.set('date', date);
	return { url, cookies } as never;
}

function postEvent(body: unknown) {
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

/** The week of 5 October 2026 as captured: room for one more session. */
const openWeek = {
	id: 39515460,
	start_day: 1791151200,
	start_day_long: '2026-10-05',
	can_receive_new_trainings: true,
	trainings: [],
	strength_trainings: [],
	entries: []
};

const candidate = { id: 24180, title: 'Recovery run', day_long: '2026-10-10' };

beforeEach(() => {
	vi.clearAllMocks();
	mockWeek.mockResolvedValue(openWeek);
	mockList.mockResolvedValue([candidate]);
	mockAdd.mockResolvedValue({ id: 133797044, title: 'Recovery run' });
});

describe('GET /api/v1/training/new', () => {
	it('lists the candidates for the day, from the week that holds it', async () => {
		const res = await GET(getEvent('2026-10-10'));

		expect(await res.json()).toEqual({ canAdd: true, candidates: [candidate] });
		expect(mockList).toHaveBeenCalledWith(cookies, 39515460, '2026-10-10');
	});

	// The month fetch asks with that week's Monday; asking with the same one
	// is what lets this read come out of the cache it left behind.
	it("asks for the week with the month fetch's own anchor", async () => {
		await GET(getEvent('2026-10-10'));
		const [, timestamp] = mockWeek.mock.calls[0] as [Cookies, number];
		const anchor = new Date(timestamp * 1000);
		expect([anchor.getFullYear(), anchor.getMonth(), anchor.getDate()]).toEqual([2026, 9, 5]);
	});

	it('says the week is full, and asks Trenara for nothing more', async () => {
		mockWeek.mockResolvedValue({ ...openWeek, can_receive_new_trainings: false });

		const res = await GET(getEvent('2026-10-10'));

		expect(await res.json()).toEqual({ canAdd: false, candidates: [] });
		expect(mockList).not.toHaveBeenCalled();
	});

	it('treats a week that does not cover the day as one that cannot take it', async () => {
		mockWeek.mockResolvedValue({ ...openWeek, start_day_long: '2026-10-12' });

		const res = await GET(getEvent('2026-10-10'));

		expect(await res.json()).toEqual({ canAdd: false, candidates: [] });
		expect(mockList).not.toHaveBeenCalled();
	});

	it('refuses a missing or malformed day', async () => {
		expect((await refusal(GET(getEvent(null)))).status).toBe(400);
		expect((await refusal(GET(getEvent('2026-10-09T22:00:00Z')))).status).toBe(400);
		expect((await refusal(GET(getEvent('2026-02-31')))).status).toBe(400);
		expect(mockWeek).not.toHaveBeenCalled();
	});

	it("passes Trenara's refusal through with its own status", async () => {
		mockList.mockRejectedValue(new HttpError('No result found', 404));
		const { status, message } = await refusal(GET(getEvent('2026-10-10')));
		expect(status).toBe(404);
		expect(message).toBe('No result found');
	});
});

describe('POST /api/v1/training/new', () => {
	it('adds the candidate to the week that holds the day', async () => {
		const res = await POST(postEvent({ date: '2026-10-10', candidateId: 24180 }));

		expect(mockAdd).toHaveBeenCalledWith(cookies, 39515460, '2026-10-10', 24180);
		expect(await res.json()).toEqual({ id: 133797044, title: 'Recovery run' });
	});

	// The picker's list can be minutes old; the week is asked again.
	it('refuses when the week has filled up since the list was drawn', async () => {
		mockWeek.mockResolvedValue({ ...openWeek, can_receive_new_trainings: false });

		const { status } = await refusal(POST(postEvent({ date: '2026-10-10', candidateId: 24180 })));

		expect(status).toBe(409);
		expect(mockAdd).not.toHaveBeenCalled();
	});

	it('names the field that was wrong', async () => {
		const { status, message } = await refusal(
			POST(postEvent({ date: '2026-10-10', candidateId: 'x' }))
		);
		expect(status).toBe(400);
		expect(message).toContain('candidateId');
		expect(mockAdd).not.toHaveBeenCalled();
	});

	it("passes Trenara's refusal through with its own status", async () => {
		mockAdd.mockRejectedValue(new HttpError('The selected training id is invalid.', 422));
		const { status, message } = await refusal(
			POST(postEvent({ date: '2026-10-10', candidateId: 24180 }))
		);
		expect(status).toBe(422);
		expect(message).toBe('The selected training id is invalid.');
	});
});
