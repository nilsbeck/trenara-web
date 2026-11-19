import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/svelte';
import type { NewsItem } from '#lib/server/trenara/types.js';
import NewsPage from './+page.svelte';

/**
 * Where a news item's "Open link" goes.
 *
 * It carried `target="_blank"` everywhere, and in the app installed on an
 * Android home screen that brought the runner back into Trainara instead of
 * the Instagram reel or YouTube video it named. In the installed app the link
 * is now a plain navigation, which Android opens in an in-app browser sheet;
 * a browser tab still gets a new tab.
 */

vi.mock('$app/navigation', () => ({ invalidate: vi.fn() }));

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function displayMode(standalone: boolean) {
	vi.stubGlobal('matchMedia', (query: string) => ({
		matches: standalone && query === '(display-mode: standalone)'
	}));
}

const item = {
	id: 82,
	title: 'New strength training levels coming soon!',
	content: 'New strength training levels will soon be available in the app.',
	video_url: 'https://www.instagram.com/reel/DcL3tTOITLf/',
	created_at: 1787065980,
	attachment: null
} as NewsItem;

function mount() {
	// The page marks the feed read on mount; nothing here is about that.
	vi.stubGlobal(
		'fetch',
		vi.fn(() => Promise.resolve(new Response('{}', { status: 500 })))
	);
	render(NewsPage, {
		props: {
			data: {
				news: {
					data: [item],
					pagination: { total: 1, count: 1, per_page: 10, current_page: 1, total_pages: 1 }
				},
				mark: null
			}
		} as never
	});
	return screen.getByRole('link', { name: /open link/i });
}

describe('news "Open link"', () => {
	it('opens a new tab in a browser', () => {
		displayMode(false);
		const link = mount();
		expect(link.getAttribute('href')).toBe(item.video_url);
		expect(link.getAttribute('target')).toBe('_blank');
	});

	it('navigates in place in the installed app instead of reopening it', async () => {
		displayMode(true);
		const link = mount();
		await vi.waitFor(() => expect(link.hasAttribute('target')).toBe(false));
		expect(link.getAttribute('href')).toBe(item.video_url);
		expect(link.getAttribute('rel')).toBe('noopener noreferrer');
	});
});
