import { describe, it, expect } from 'vitest';
import { OPENING_VIEW_COOKIE, openingViewCookie, openingViewFor } from './opening-view';

const IPHONE =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 19_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Mobile/15E148 Safari/604.1';
const ANDROID_PHONE =
	'Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';
const ANDROID_TABLET =
	'Mozilla/5.0 (Linux; Android 16; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const IPAD =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Safari/605.1.15';
const DESKTOP =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

function headers(fields: Record<string, string> = {}): Headers {
	return new Headers(fields);
}

describe('openingViewFor', () => {
	it('takes what the browser remembered over any guess', () => {
		expect(openingViewFor('month', headers({ 'user-agent': IPHONE }))).toBe('month');
		expect(openingViewFor('week', headers({ 'user-agent': DESKTOP }))).toBe('week');
	});

	it('ignores a remembered value that is neither view', () => {
		expect(openingViewFor('<script>', headers({ 'user-agent': DESKTOP }))).toBe('month');
		expect(openingViewFor('WEEK', headers({ 'user-agent': DESKTOP }))).toBe('month');
	});

	it('opens a phone on the week on its first visit', () => {
		expect(openingViewFor(undefined, headers({ 'user-agent': IPHONE }))).toBe('week');
		expect(openingViewFor(undefined, headers({ 'user-agent': ANDROID_PHONE }))).toBe('week');
		expect(openingViewFor(undefined, headers({ 'sec-ch-ua-mobile': '?1' }))).toBe('week');
	});

	it('opens a tablet or a desktop on the month, as its media query will', () => {
		expect(openingViewFor(undefined, headers({ 'user-agent': ANDROID_TABLET }))).toBe('month');
		expect(openingViewFor(undefined, headers({ 'user-agent': IPAD }))).toBe('month');
		expect(openingViewFor(undefined, headers({ 'user-agent': DESKTOP }))).toBe('month');
		expect(
			openingViewFor(undefined, headers({ 'user-agent': DESKTOP, 'sec-ch-ua-mobile': '?0' }))
		).toBe('month');
	});

	it('falls back to the month when the request says nothing', () => {
		expect(openingViewFor(undefined, headers())).toBe('month');
	});
});

describe('openingViewCookie', () => {
	it('remembers the view for the whole app, for a year', () => {
		const cookie = openingViewCookie('week', true);
		expect(cookie.startsWith(`${OPENING_VIEW_COOKIE}=week;`)).toBe(true);
		expect(cookie).toContain('Path=/');
		expect(cookie).toContain(`Max-Age=${365 * 24 * 60 * 60}`);
		expect(cookie).toContain('SameSite=Lax');
		expect(cookie).toContain('Secure');
	});

	it('leaves Secure off where the page itself is not', () => {
		expect(openingViewCookie('month', false)).not.toContain('Secure');
	});
});
