import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/svelte';
import type { NewsItem } from '#lib/server/trenara/types.js';
import NewsPage from './+page.svelte';

/**
 * Where a news item's "Open link" goes.
 *
 * The link went into `href` exactly as Trenara sent it, and an address
 * without its scheme is relative to a browser: `youtu.be/…` on `/news` opened
 * `/news/youtu.be/…`, which is Trainara again rather than the video.
 */

vi.mock('$app/navigation', () => ({ invalidate: vi.fn() }));

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function mount(videoUrl: string | null) {
	// The page marks the feed read on mount; nothing here is about that.
	vi.stubGlobal(
		'fetch',
		vi.fn(() => Promise.resolve(new Response('{}', { status: 500 })))
	);
	const item = {
		id: 82,
		title: 'The third podcast episode is now available!',
		content: 'Listen now.',
		video_url: videoUrl,
		created_at: 1786960419,
		attachment: null
	} as NewsItem;
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
}

describe('news "Open link"', () => {
	it('points at the site Trenara named, in a new tab', () => {
		mount('https://youtu.be/fJlCe7RPPDA');
		const link = screen.getByRole('link', { name: /open link/i });
		expect(link.getAttribute('href')).toBe('https://youtu.be/fJlCe7RPPDA');
		expect(link.getAttribute('target')).toBe('_blank');
	});

	it('leaves the app for an address sent without its scheme', () => {
		mount('youtu.be/fJlCe7RPPDA');
		const link = screen.getByRole('link', { name: /open link/i });
		// Resolved by the browser, so a relative href shows up here as /news/…
		expect((link as HTMLAnchorElement).href).toBe('https://youtu.be/fJlCe7RPPDA');
	});

	it('draws no link for one that is not a web address', () => {
		mount('javascript:alert(1)');
		expect(screen.queryByRole('link', { name: /open link/i })).toBeNull();
	});
});
