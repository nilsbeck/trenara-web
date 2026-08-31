import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import RateTrainingInline from '$lib/components/training/rate-training-inline.svelte';
import type { Entry } from '$lib/server/trenara/types';

function makeEntry(): Entry {
	return {
		id: 29626510,
		name: 'Garmin Treadmill running',
		start_time: '2026-08-31T18:42:30+02:00',
		type: 'run',
		rpe: null,
		ask_feedback: true,
		laps: [],
		splits: [],
		gps_media: [],
		notification: null
	} as unknown as Entry;
}

/** What the endpoint answers with: the whole entry, rated. */
function ratedResponse(overrides: Record<string, unknown> = {}) {
	return new Response(JSON.stringify({ id: 29626510, rpe: 5, ask_feedback: false, ...overrides }), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
}

function stubFetch(answer: () => Promise<Response> | Response) {
	const fetchMock = vi.fn(async () => answer());
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

async function rate() {
	await fireEvent.click(screen.getByRole('button', { name: 'Rate training' }));
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('RateTrainingInline', () => {
	it('sends the entry and the slider value', async () => {
		const fetchMock = stubFetch(() => ratedResponse());
		render(RateTrainingInline, { entry: makeEntry() });

		await rate();

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(JSON.parse(init.body as string)).toEqual({ entryId: 29626510, feedback: 5 });
	});

	it('hands the whole entry the server answered with to the caller', async () => {
		// The point of the response: the week can hold the server's copy —
		// `ask_feedback` retired and all — instead of the value just sent.
		stubFetch(() => ratedResponse());
		const onRated = vi.fn();
		render(RateTrainingInline, { entry: makeEntry(), onRated });

		await rate();

		await waitFor(() => expect(onRated).toHaveBeenCalledTimes(1));
		expect(onRated.mock.calls[0][0]).toMatchObject({ id: 29626510, ask_feedback: false });
	});

	it('takes the rating the server stored, not the one it sent', async () => {
		stubFetch(() => ratedResponse({ rpe: 4 }));
		const entry = makeEntry();
		render(RateTrainingInline, { entry });

		await rate();

		await waitFor(() => expect(entry.rpe).toBe(4));
	});

	it('keeps the rating on screen when the answer is not the entry', async () => {
		// A proxy standing in for the app, or an upstream that stops echoing
		// the entry: the write still succeeded, so the rating must stand and
		// only the week's copy is left for the next refresh to correct.
		stubFetch(() => new Response('', { status: 200 }));
		const onRated = vi.fn();
		const entry = makeEntry();
		render(RateTrainingInline, { entry, onRated });

		await rate();

		await waitFor(() => expect(entry.rpe).toBe(5));
		expect(onRated).not.toHaveBeenCalled();
		expect(screen.queryByText(/Could not save your rating/)).toBeNull();
	});

	it('says the rating failed, and rates nothing, when the write is refused', async () => {
		stubFetch(() => new Response('nope', { status: 500 }));
		const onRated = vi.fn();
		const entry = makeEntry();
		render(RateTrainingInline, { entry, onRated });

		await rate();

		expect(await screen.findByText(/Could not save your rating/)).toBeTruthy();
		expect(entry.rpe).toBeNull();
		expect(onRated).not.toHaveBeenCalled();
	});
});
