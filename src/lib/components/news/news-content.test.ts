import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/svelte';
import NewsContent from './news-content.svelte';

/**
 * The body of a news item: plain text as text, markup only once DOMPurify has
 * cleaned it, and never anything unsanitised in the document.
 *
 * The sanitiser is the real one, reached through a seam that can hold it back
 * or make it fail, so each case says what is on screen before it has arrived
 * and after.
 */

const sanitizer = vi.hoisted(() => {
	let release: () => void = () => {};
	return {
		gate: Promise.resolve(),
		fail: false,
		hold() {
			this.gate = new Promise<void>((resolve) => (release = resolve));
		},
		release: () => release()
	};
});

vi.mock('#lib/utils/sanitize.js', async (importOriginal) => {
	const real = await importOriginal<typeof import('#lib/utils/sanitize.js')>();
	return {
		...real,
		loadSanitizer: async () => {
			await sanitizer.gate;
			if (sanitizer.fail) throw new TypeError('Failed to fetch dynamically imported module');
			return real.loadSanitizer();
		}
	};
});

afterEach(() => {
	sanitizer.release();
	sanitizer.gate = Promise.resolve();
	sanitizer.fail = false;
	cleanup();
});

const MARKUP =
	'<p>Race week <strong>tips</strong></p><script>window.pwned = true</script><img src="https://tracker.example/pixel.png">';

describe('news content', () => {
	it('renders plain text as text, keeping its line breaks', () => {
		const { container } = render(NewsContent, { content: 'First line\nSecond <3 line' });

		const paragraph = container.querySelector('p');
		expect(paragraph?.textContent).toBe('First line\nSecond <3 line');
		expect(container.querySelector('.news-content')).toBeNull();
	});

	it('renders markup once it has been sanitised, and only what survived', async () => {
		const { container } = render(NewsContent, { content: MARKUP });

		await waitFor(() => expect(container.querySelector('strong')?.textContent).toBe('tips'));
		expect(container.querySelector('script')).toBeNull();
		// An image in markup could fetch from any host the CSP allows: a read
		// receipt for whoever wrote it (agents.md §3).
		expect(container.querySelector('img')).toBeNull();
	});

	it('puts nothing in the document before the sanitiser has arrived', async () => {
		sanitizer.hold();
		const { container } = render(NewsContent, { content: MARKUP });

		const host = container.querySelector('.news-content');
		expect(host).not.toBeNull();
		expect(host?.innerHTML).toBe('');

		sanitizer.release();
		await waitFor(() => expect(container.querySelector('strong')).not.toBeNull());
	});

	it('shows the markup as text when the sanitiser cannot be loaded', async () => {
		sanitizer.fail = true;
		const { container } = render(NewsContent, { content: MARKUP });

		await waitFor(() => expect(container.querySelector('.news-content')?.textContent).toBe(MARKUP));
		expect(container.querySelector('script')).toBeNull();
		expect(container.querySelector('strong')).toBeNull();
	});

	/**
	 * Both the old effect and a first cut of the attachment read `content`
	 * only inside the promise callback, where nothing tracks it. The effect
	 * re-ran on `looksLikeMarkup`, a boolean that stays `true` from one piece
	 * of markup to the next — so new markup after the first had loaded left
	 * the old one on screen.
	 */
	it('shows new markup when the content changes after the first has rendered', async () => {
		const { container, rerender } = render(NewsContent, { content: '<p>Old <em>item</em></p>' });
		await waitFor(() => expect(container.querySelector('em')).not.toBeNull());

		await rerender({ content: '<p>New <b>item</b></p>' });

		await waitFor(() => expect(container.querySelector('b')?.textContent).toBe('item'));
		expect(container.querySelector('em')).toBeNull();
	});

	it('writes only the newest content when it changes while the sanitiser loads', async () => {
		sanitizer.hold();
		const { container, rerender } = render(NewsContent, { content: '<p>Old <em>item</em></p>' });

		await rerender({ content: '<p>New <b>item</b></p>' });
		sanitizer.release();

		await waitFor(() => expect(container.querySelector('b')?.textContent).toBe('item'));
		expect(container.querySelector('em')).toBeNull();
	});
});
