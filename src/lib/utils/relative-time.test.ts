import { describe, it, expect } from 'vitest';
import { relativeTimeAgo } from './relative-time';

const NOW = new Date('2026-09-02T12:00:00Z');

function ago(ms: number): Date {
	return new Date(NOW.getTime() - ms);
}

describe('relativeTimeAgo', () => {
	it('reads a moment in the future as "just now" rather than a negative age', () => {
		expect(relativeTimeAgo(new Date(NOW.getTime() + 60_000), NOW)).toBe('just now');
	});

	it('reads under a minute as "less than a minute ago"', () => {
		expect(relativeTimeAgo(ago(30_000), NOW)).toBe('less than a minute ago');
	});

	it('counts minutes', () => {
		expect(relativeTimeAgo(ago(5 * 60_000), NOW)).toBe('5 minutes ago');
	});

	it('is singular for exactly one of a unit', () => {
		expect(relativeTimeAgo(ago(60 * 60_000), NOW)).toBe('1 hour ago');
		expect(relativeTimeAgo(ago(24 * 60 * 60_000), NOW)).toBe('1 day ago');
	});

	it('counts hours', () => {
		expect(relativeTimeAgo(ago(3 * 60 * 60_000), NOW)).toBe('3 hours ago');
	});

	it('counts days', () => {
		expect(relativeTimeAgo(ago(6 * 24 * 60 * 60_000), NOW)).toBe('6 days ago');
	});

	it('counts months once a day count would be unreadable', () => {
		expect(relativeTimeAgo(ago(45 * 24 * 60 * 60_000), NOW)).toBe('1 month ago');
	});

	it('counts years', () => {
		expect(relativeTimeAgo(ago(400 * 24 * 60 * 60_000), NOW)).toBe('1 year ago');
	});
});
