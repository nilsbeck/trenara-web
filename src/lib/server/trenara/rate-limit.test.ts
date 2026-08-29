import { describe, it, expect, beforeEach } from 'vitest';
import {
	normalisePath,
	parseRetryAfter,
	rateLimitDiagnostic,
	recordRequest,
	resetTrail
} from './rate-limit';

beforeEach(() => {
	resetTrail();
});

const NOW = Date.parse('2026-08-29T10:00:00.000Z');

/** A response's headers, as the transport hands them over. */
function headers(entries: Record<string, string> = {}): Headers {
	return new Headers(entries);
}

describe('normalisePath', () => {
	// The whole point of the trail is the count per endpoint, and ids would
	// split one endpoint into a row per training.
	it('folds ids away so one endpoint counts as one endpoint', () => {
		expect(normalisePath('https://backend-prod.trenara.com/api/schedule/trainings/127477827')).toBe(
			'/api/schedule/trainings/:id'
		);
		expect(
			normalisePath('https://backend-prod.trenara.com/api/schedule/trainings/127477827/intensity')
		).toBe('/api/schedule/trainings/:id/intensity');
	});

	// The schedule's six week-requests differ only by a timestamp parameter.
	// Keeping it would make six rows of one, which is the opposite of grouping.
	it('drops the query string, so a fan-out reads as one row with a count', () => {
		expect(normalisePath('https://backend-prod.trenara.com/api/schedule?date=1756000000')).toBe(
			'/api/schedule'
		);
		expect(normalisePath('https://backend-prod.trenara.com/api/news/?page=3')).toBe('/api/news/');
	});

	it('copes with something that is not a URL at all', () => {
		expect(normalisePath('/api/relative?x=1')).toBe('/api/relative');
	});
});

describe('parseRetryAfter', () => {
	it('reads the header in seconds', () => {
		expect(parseRetryAfter('30')).toBe(30);
		expect(parseRetryAfter(' 45 ')).toBe(45);
		expect(parseRetryAfter('0')).toBe(0);
	});

	// Both forms are legal, and Trenara has not been seen sending either, so
	// neither is assumed.
	it('reads the header as a date', () => {
		expect(parseRetryAfter(new Date(NOW + 90_000).toUTCString(), NOW)).toBe(90);
	});

	it('is null when there is no usable header', () => {
		expect(parseRetryAfter(null)).toBeNull();
		expect(parseRetryAfter('soon')).toBeNull();
		expect(parseRetryAfter('')).toBeNull();
	});

	it('does not report a date already past as a wait', () => {
		expect(parseRetryAfter(new Date(NOW - 60_000).toUTCString(), NOW)).toBe(0);
	});
});

describe('the snapshot taken when a 429 arrives', () => {
	it('names the request that was refused', () => {
		const snapshot = rateLimitDiagnostic(
			'get',
			'https://backend-prod.trenara.com/api/schedule?date=1',
			headers(),
			NOW
		);

		expect(snapshot.method).toBe('GET');
		expect(snapshot.path).toBe('/api/schedule');
		expect(snapshot.at).toBe('2026-08-29T10:00:00.000Z');
	});

	// The single most valuable thing on the response: it states the limit that
	// was hit, which nothing else in this app knows.
	it('keeps every rate-limit header, whatever the API calls them', () => {
		const snapshot = rateLimitDiagnostic(
			'GET',
			'https://backend-prod.trenara.com/api/goal',
			headers({
				'Retry-After': '30',
				'X-RateLimit-Limit': '60',
				'X-RateLimit-Remaining': '0',
				'RateLimit-Reset': '1756000000',
				'Content-Type': 'application/json'
			}),
			NOW
		);

		expect(snapshot.retryAfterSeconds).toBe(30);
		expect(snapshot.limitHeaders['x-ratelimit-limit']).toBe('60');
		expect(snapshot.limitHeaders['ratelimit-reset']).toBe('1756000000');
		// Everything else is noise in a report meant to be read at a glance.
		expect(snapshot.limitHeaders['content-type']).toBeUndefined();
	});

	// The question a 429 actually poses: what did we just send? A dashboard
	// load fires about a dozen at once, most of them the same endpoint.
	it('counts what went out, grouped by endpoint', () => {
		for (let i = 0; i < 6; i++) {
			recordRequest('GET', `https://backend-prod.trenara.com/api/schedule?date=${i}`, NOW - 500);
		}
		recordRequest('GET', 'https://backend-prod.trenara.com/api/me', NOW - 400);
		recordRequest('GET', 'https://backend-prod.trenara.com/api/goal', NOW - 400);

		const snapshot = rateLimitDiagnostic('GET', '/api/schedule', headers(), NOW);
		const tenSeconds = snapshot.windows[0];

		expect(tenSeconds.seconds).toBe(10);
		expect(tenSeconds.total).toBe(8);
		expect(tenSeconds.byPath[0]).toEqual({ path: 'GET /api/schedule', count: 6 });
	});

	// Ten seconds catches the burst one page load fires; sixty catches
	// sustained polling. A limit tripped by one and not the other points at
	// completely different code, so both are reported.
	it('separates a burst from a slow drip', () => {
		recordRequest('GET', 'https://backend-prod.trenara.com/api/threads', NOW - 45_000);
		recordRequest('GET', 'https://backend-prod.trenara.com/api/threads', NOW - 30_000);
		recordRequest('GET', 'https://backend-prod.trenara.com/api/schedule', NOW - 1_000);

		const snapshot = rateLimitDiagnostic('GET', '/api/schedule', headers(), NOW);

		expect(snapshot.windows.map((w) => [w.seconds, w.total])).toEqual([
			[10, 1],
			[60, 3]
		]);
	});

	it('leaves out what happened before the window', () => {
		recordRequest('GET', 'https://backend-prod.trenara.com/api/old', NOW - 120_000);

		const snapshot = rateLimitDiagnostic('GET', '/api/schedule', headers(), NOW);
		expect(snapshot.windows.every((w) => w.total === 0)).toBe(true);
	});

	// Several serverless instances may be serving at once, each with its own
	// trail, so a count is a floor rather than a total. The id is what lets two
	// reports be told apart.
	it('says which instance the counts came from', () => {
		const snapshot = rateLimitDiagnostic('GET', '/api/schedule', headers(), NOW);
		expect(snapshot.instance).toMatch(/^[a-z0-9]+$/);
	});

	it('keeps the trail bounded rather than growing without limit', () => {
		for (let i = 0; i < 500; i++) {
			recordRequest('GET', 'https://backend-prod.trenara.com/api/schedule', NOW - 100);
		}

		expect(rateLimitDiagnostic('GET', '/api/schedule', headers(), NOW).windows[0].total).toBe(300);
	});
});
