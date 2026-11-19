import { describe, it, expect } from 'vitest';
import { loadSanitizer } from './sanitize';

describe('loadSanitizer', () => {
	it('shares one instance between callers', async () => {
		const [a, b] = await Promise.all([loadSanitizer(), loadSanitizer()]);
		expect(a).toBe(b);
	});

	it('keeps the markup the coach sends', async () => {
		const sanitize = await loadSanitizer();
		const html = '<h3>Plan</h3><p>Easy <strong>run</strong><br></p><ul><li>one</li></ul>';
		expect(sanitize(html)).toBe(html);
	});

	it('removes script and inline handlers', async () => {
		const sanitize = await loadSanitizer();
		const out = sanitize('<p onclick="alert(1)">hi</p><script>alert(1)</script>');
		expect(out).toBe('<p>hi</p>');
	});

	it.each([
		['a remote image', '<img src="https://tracker.example/pixel.gif">'],
		['an image set', '<picture><source srcset="https://tracker.example/a.png"></picture>'],
		['a stylesheet', '<style>body{display:none}</style>'],
		['a linked stylesheet', '<link rel="stylesheet" href="https://evil.example/x.css">'],
		['a form', '<form action="https://evil.example"><input name="p"></form>'],
		['an svg', '<svg><image href="https://tracker.example/pixel.gif"></image></svg>'],
		['an iframe', '<iframe src="https://evil.example"></iframe>']
	])('removes %s entirely', async (_label, html) => {
		const sanitize = await loadSanitizer();
		expect(sanitize(`<p>before</p>${html}<p>after</p>`)).toBe('<p>before</p><p>after</p>');
	});

	it('strips inline style', async () => {
		const sanitize = await loadSanitizer();
		expect(sanitize('<p style="position:fixed;inset:0">x</p>')).toBe('<p>x</p>');
	});

	it('opens links in a new tab with no opener or referrer', async () => {
		const sanitize = await loadSanitizer();
		const out = sanitize('<a href="https://trenara.com">site</a>');
		const link = new DOMParser().parseFromString(out, 'text/html').querySelector('a');
		expect(link?.getAttribute('href')).toBe('https://trenara.com');
		expect(link?.getAttribute('target')).toBe('_blank');
		expect(link?.getAttribute('rel')).toBe('noopener noreferrer nofollow');
	});

	it('drops a javascript: href', async () => {
		const sanitize = await loadSanitizer();
		expect(sanitize('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:');
	});
});
