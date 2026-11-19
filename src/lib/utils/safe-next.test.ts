import { describe, it, expect } from 'vitest';
import { safeNext } from './safe-next';

/**
 * What a browser does with a `Location` header, which is the only reading of
 * the result that matters: a value the guard lets through is resolved against
 * the app's own URL, and the redirect is open if that lands on another host.
 */
function landsOn(location: string): string {
	return new URL(location, 'https://trainara.example/login').host;
}

describe('safeNext', () => {
	it('keeps a path on this app, with its query and fragment', () => {
		expect(safeNext('/goal')).toBe('/goal');
		expect(safeNext('/news?item=4#top')).toBe('/news?item=4#top');
	});

	it('falls back to the dashboard when there is nothing to go back to', () => {
		expect(safeNext(null)).toBe('/dashboard');
		expect(safeNext(undefined)).toBe('/dashboard');
		expect(safeNext('')).toBe('/dashboard');
	});

	it('refuses an absolute or protocol-relative URL', () => {
		expect(safeNext('https://evil.example/')).toBe('/dashboard');
		expect(safeNext('//evil.example/')).toBe('/dashboard');
		expect(safeNext('javascript:alert(1)')).toBe('/dashboard');
	});

	/**
	 * The bypasses a prefix check misses. A browser reads a backslash in a URL
	 * as a slash, and drops tabs and newlines from it altogether, so each of
	 * these starts with a single `/` and still leaves the site — `/\evil` is
	 * `//evil`. `?next=/%5Cevil.example` arrives here already decoded.
	 */
	it.each([
		['backslash', '/\\evil.example'],
		['two backslashes', '/\\\\evil.example'],
		['slash, backslash', '/\\/evil.example'],
		['tab between the slashes', '/\t/evil.example'],
		['newline between the slashes', '/\n/evil.example'],
		['carriage return between the slashes', '/\r/evil.example']
	])('refuses a path that a browser resolves off-site (%s)', (_, raw) => {
		// The premise, checked rather than asserted: left alone, each one
		// really does leave the app.
		expect(landsOn(raw)).toBe('evil.example');

		const next = safeNext(raw);
		expect(landsOn(next)).toBe('trainara.example');
		expect(next).toBe('/dashboard');
	});

	it('hands back the path as the browser will read it, not as it was typed', () => {
		expect(safeNext('/goal/../news')).toBe('/news');
		expect(safeNext('/a b')).toBe('/a%20b');
	});
});
