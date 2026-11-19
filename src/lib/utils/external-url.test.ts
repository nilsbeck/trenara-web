import { describe, it, expect } from 'vitest';
import { externalUrl } from './external-url';

describe('externalUrl', () => {
	it.each([
		['https://youtu.be/fJlCe7RPPDA', 'https://youtu.be/fJlCe7RPPDA'],
		['http://example.com/a?b=1', 'http://example.com/a?b=1'],
		[
			'  https://www.instagram.com/reel/DcL3tTOITLf/  ',
			'https://www.instagram.com/reel/DcL3tTOITLf/'
		]
	])('keeps an absolute web address: %s', (raw, expected) => {
		expect(externalUrl(raw)).toBe(expected);
	});

	// These are what opened Trainara again: relative to a browser, so they
	// resolved against /news.
	it.each([
		['youtu.be/fJlCe7RPPDA', 'https://youtu.be/fJlCe7RPPDA'],
		['www.instagram.com/reel/DcL3tTOITLf/', 'https://www.instagram.com/reel/DcL3tTOITLf/'],
		['//www.youtube.com/watch?v=x', 'https://www.youtube.com/watch?v=x'],
		['/trenara.com/blog', 'https://trenara.com/blog']
	])('reads an address without a scheme as a web address: %s', (raw, expected) => {
		expect(externalUrl(raw)).toBe(expected);
	});

	it.each([
		['null', null],
		['undefined', undefined],
		['blank', '   '],
		['a javascript: URL', 'javascript:alert(1)'],
		['a data: URL', 'data:text/html,<p>x</p>'],
		['a word', 'watch here'],
		['a host with no dot', 'localhost/x']
	])('gives no link for %s', (_label, raw) => {
		expect(externalUrl(raw)).toBeNull();
	});
});
