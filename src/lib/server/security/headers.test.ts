import { describe, it, expect, vi } from 'vitest';

vi.mock('$app/environment', () => ({ dev: false }));

const { securityHeaders } = await import('./headers');

async function run(response: Response) {
	return securityHeaders({
		event: {} as never,
		resolve: () => Promise.resolve(response)
	} as never);
}

describe('securityHeaders', () => {
	it('sets a default referrer policy when the route has not set one', async () => {
		const result = await run(new Response('page'));
		expect(result.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
	});

	it("leaves a route's own referrer policy alone", async () => {
		// `setHeaders` inside a route's `load` runs as part of `resolve`, so by
		// the time this hook reads the response it is already there — this is
		// what lets the public share page's `no-referrer` survive rather than
		// being written back to the looser default on the way out.
		const response = new Response('page');
		response.headers.set('referrer-policy', 'no-referrer');

		const result = await run(response);
		expect(result.headers.get('referrer-policy')).toBe('no-referrer');
	});

	it('still sets the other headers unconditionally', async () => {
		const result = await run(new Response('page'));
		expect(result.headers.get('x-content-type-options')).toBe('nosniff');
		expect(result.headers.get('cross-origin-opener-policy')).toBe('same-origin');
		expect(result.headers.get('strict-transport-security')).toContain('max-age=');
	});
});
