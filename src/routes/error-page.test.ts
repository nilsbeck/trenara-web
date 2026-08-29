import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen, within } from '@testing-library/svelte';

/**
 * `$app/state` exposes `page` as a reactive singleton the page reads directly,
 * so the case under test is set by swapping what it holds before rendering.
 */
const state = vi.hoisted(() => ({
	page: { status: 500, error: null as App.Error | null, url: new URL('http://localhost/dashboard') }
}));

vi.mock('$app/state', () => ({ page: state.page }));
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }));

import ErrorPage from './+error.svelte';

const diagnostic = {
	at: '2026-08-29T10:00:00.000Z',
	method: 'GET',
	path: '/api/schedule',
	retryAfterSeconds: 30,
	limitHeaders: { 'x-ratelimit-limit': '60', 'retry-after': '30' },
	windows: [
		{
			seconds: 10,
			total: 12,
			byPath: [
				{ path: 'GET /api/schedule', count: 6 },
				{ path: 'GET /api/me', count: 1 }
			]
		},
		{ seconds: 60, total: 31, byPath: [{ path: 'GET /api/schedule', count: 18 }] }
	],
	instance: 'ab12cd'
};

function show(status: number, error: App.Error | null) {
	state.page.status = status;
	state.page.error = error;
	render(ErrorPage);
}

beforeEach(() => {
	state.page.status = 500;
	state.page.error = null;
});

afterEach(cleanup);

describe('the error page on a rate limit', () => {
	// "Something went wrong" sends the runner looking for a fault that does not
	// exist. Nothing is broken; the app asked for too much at once.
	it('calls it a pause rather than a breakage', () => {
		show(429, { message: 'Trenara is asking this app to slow down.', rateLimit: diagnostic });

		expect(screen.getByText('Too many requests, too quickly')).toBeTruthy();
		expect(screen.queryByText('Something went wrong')).toBeNull();
	});

	it('does not blame Trenara for being unreachable when it answered', () => {
		show(429, { message: 'slow down', rateLimit: diagnostic });
		expect(screen.queryByText('Trenara is not answering')).toBeNull();
	});

	// The point of the whole exercise: the trail has to be in front of whoever
	// hit it, because branches are tried as preview deployments where nobody
	// is reading a server log.
	it('shows what was being requested, and how much of it', () => {
		show(429, { message: 'slow down', rateLimit: diagnostic });

		const report = within(screen.getByTestId('rate-limit-report'));

		// Named in the refused line, in the busiest-endpoints list, and in the
		// raw payload — all three are wanted, so the count is what is asserted.
		expect(report.getAllByText('GET /api/schedule').length).toBeGreaterThan(1);
		expect(report.getByText('×6')).toBeTruthy();
		expect(report.getByText('Sent in the last 10s')).toBeTruthy();
		expect(report.getByText('Sent in the last 60s')).toBeTruthy();
		expect(report.getByText('12')).toBeTruthy();
	});

	it('offers the whole report in the form it should be sent on in', () => {
		show(429, { message: 'slow down', rateLimit: diagnostic });

		expect(screen.getByRole('button', { name: /copy the full report/i })).toBeTruthy();
		// The raw payload is on the page, so it can be selected even where the
		// clipboard is blocked.
		expect(screen.getByText(/"instance": "ab12cd"/)).toBeTruthy();
	});

	// A count from one instance read as a total would send someone hunting for
	// requests that another instance sent.
	it('says the counts are from one instance and may undercount', () => {
		show(429, { message: 'slow down', rateLimit: diagnostic });
		expect(screen.getByText(/real total may be higher/)).toBeTruthy();
	});

	it('still reads as a rate limit on a 429 with no snapshot attached', () => {
		show(429, { message: 'slow down' });

		expect(screen.getByText('Too many requests, too quickly')).toBeTruthy();
		expect(screen.queryByTestId('rate-limit-report')).toBeNull();
	});
});

describe('the error page on everything else', () => {
	it('keeps naming the right server for a connection failure', () => {
		show(502, { message: 'Trenara could not be reached. Please try again.' });
		expect(screen.getByText('Trenara is not answering')).toBeTruthy();
	});

	// 503 is also what a storage failure carries, so the flag has to win.
	it('names storage rather than Trenara when the database is the one down', () => {
		show(503, { message: 'Your saved history could not be loaded.', storage: true });

		expect(screen.getByText('Your history is not available')).toBeTruthy();
		expect(screen.queryByText('Trenara is not answering')).toBeNull();
	});

	it('says a missing page is missing', () => {
		show(404, { message: 'Not Found' });
		expect(screen.getByText('Nothing here')).toBeTruthy();
	});

	it('falls back to a plain apology for anything unrecognised', () => {
		show(500, { message: 'Something went wrong on our side.' });
		expect(screen.getByText('Something went wrong')).toBeTruthy();
	});
});
