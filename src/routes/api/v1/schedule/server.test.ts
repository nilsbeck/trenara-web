import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { HttpError } from '$lib/server/trenara/client';
import { toLocalDateString } from '$lib/utils/date';
import { GET } from './+server';

const mockGetSchedule = vi.fn();

vi.mock('$lib/server/trenara', () => ({
	trainingApi: { getSchedule: (...args: unknown[]) => mockGetSchedule(...args) }
}));

const week = { trainings: [], strength_trainings: [], entries: [] };

function eventFor(query: string, headers: Record<string, string> = {}) {
	return {
		url: new URL(`http://localhost/api/v1/schedule?${query}`),
		request: new Request(`http://localhost/api/v1/schedule?${query}`, { headers }),
		cookies: {} as Cookies
	} as unknown as Parameters<typeof GET>[0];
}

/** The days the route asked Trenara about, as the local days they fall on. */
function weeksAsked(): string[] {
	return mockGetSchedule.mock.calls.map((call) =>
		toLocalDateString(new Date((call[1] as number) * 1000))
	);
}

describe('GET /api/v1/schedule', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Pinned to September, so a request that loses its month and falls back
		// to "now" is visibly the wrong month rather than accidentally right.
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(2026, 8, 27, 12));
		mockGetSchedule.mockResolvedValue(week);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// The folded week reached 28 September – 4 October and nothing past it:
	// the month was sent as the instant of local midnight on the 1st, which
	// this server (in UTC) read as 30 September, and answered with September.
	it('answers a calendar day with the weeks of that month', async () => {
		const response = await GET(eventFor('date=2026-10-01'));

		expect(response.status).toBe(200);
		expect(weeksAsked()).toEqual([
			'2026-10-01',
			'2026-10-05',
			'2026-10-12',
			'2026-10-19',
			'2026-10-26'
		]);
	});

	it('still reads a millisecond timestamp from a tab opened before the change', async () => {
		await GET(eventFor(`date=${new Date(2026, 9, 15).getTime()}`));

		expect(weeksAsked()[0]).toBe('2026-10-01');
	});

	it('refuses a date it cannot read', async () => {
		await expect(GET(eventFor('date=soon'))).rejects.toMatchObject({ status: 400 });
		await expect(GET(eventFor('date=2026-02-31'))).rejects.toMatchObject({ status: 400 });
		expect(mockGetSchedule).not.toHaveBeenCalled();
	});

	it('asks only for the weeks still open when given `from`', async () => {
		const response = await GET(eventFor('date=2026-10-01&from=2026-10-14'));
		const body = await response.json();

		expect(weeksAsked()).toEqual(['2026-10-12', '2026-10-19', '2026-10-26']);
		expect(body.covered_from).toBe('2026-10-12');
	});

	it('answers 304 when the caller already holds this exact month', async () => {
		const first = await GET(eventFor('date=2026-10-01'));
		const etag = first.headers.get('etag') ?? '';

		const second = await GET(eventFor('date=2026-10-01', { 'if-none-match': etag }));

		expect(second.status).toBe(304);
	});

	it('passes a refusal from Trenara through with its status', async () => {
		mockGetSchedule.mockRejectedValue(new HttpError('Too Many Requests', 429, {}));

		await expect(GET(eventFor('date=2026-10-01'))).rejects.toMatchObject({ status: 429 });
	});
});
