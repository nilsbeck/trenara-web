import { describe, it, expect, vi } from 'vitest';
import type { UnreadSummary } from '$lib/utils/news-unread';
import { NewsBadgeStore } from './news-badge.svelte';

function jsonResponse(body: unknown, status = 200): Response {
	return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

/**
 * A load whose value the test can move on, as a re-run of the layout load does.
 * `$state`, as the layout's `data` prop is reactive — which is why this file is
 * a `.svelte.test.ts`.
 */
function loadOf(initial: UnreadSummary | null) {
	let current = $state.raw(initial);
	return {
		read: () => current,
		rerun: (next: UnreadSummary | null) => {
			current = next;
		}
	};
}

describe('NewsBadgeStore', () => {
	it('draws what the load had, without asking', () => {
		const fetcher = vi.fn();
		const store = new NewsBadgeStore(() => ({ count: 3, capped: false }), { fetch: fetcher });

		expect(store.label).toBe('3');
		expect(store.unknown).toBe(false);
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('tells a load that could not say apart from one with nothing unread', () => {
		expect(new NewsBadgeStore(() => null).unknown).toBe(true);
		expect(new NewsBadgeStore(() => ({ count: 0, capped: false })).unknown).toBe(false);
	});

	// The phone: the load gave up on a cold instance, and nothing re-runs it.
	it('draws the dot once the badge the load had no time for arrives', async () => {
		const fetcher = vi.fn().mockResolvedValue(jsonResponse({ badge: { count: 2, capped: false } }));
		const store = new NewsBadgeStore(() => null, { fetch: fetcher as typeof fetch });
		expect(store.label).toBe('');

		await store.refresh();

		expect(fetcher).toHaveBeenCalledWith('/api/v1/news/badge');
		expect(store.label).toBe('2');
	});

	it('clears a dot the reader has since cleared elsewhere', async () => {
		const fetcher = vi.fn().mockResolvedValue(jsonResponse({ badge: { count: 0, capped: false } }));
		// One object, as the load's `data.newsBadge` is between re-runs.
		const fromLoad = { count: 2, capped: false };
		const store = new NewsBadgeStore(() => fromLoad, { fetch: fetcher as typeof fetch });

		await store.refresh();

		expect(store.label).toBe('');
	});

	it('keeps what is on screen when the server cannot say either', async () => {
		const fetcher = vi.fn().mockResolvedValue(jsonResponse({ badge: null }));
		const store = new NewsBadgeStore(() => ({ count: 2, capped: false }), {
			fetch: fetcher as typeof fetch
		});

		await store.refresh();

		expect(store.label).toBe('2');
	});

	it('keeps what is on screen when the request fails', async () => {
		const failing = vi.fn().mockResolvedValue(jsonResponse({}, 503));
		const offline = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

		const a = new NewsBadgeStore(() => ({ count: 2, capped: false }), {
			fetch: failing as typeof fetch
		});
		const b = new NewsBadgeStore(() => ({ count: 2, capped: false }), {
			fetch: offline as typeof fetch
		});
		await a.refresh();
		await b.refresh();

		expect(a.label).toBe('2');
		expect(b.label).toBe('2');
	});

	// The news page marks the feed read and re-runs the load, which brings a
	// cleared badge. An answer asked for before that must not put the dot back.
	it('drops an answer that left before the load ran again', async () => {
		const load = loadOf({ count: 2, capped: false });
		let answer: (res: Response) => void = () => {};
		const fetcher = vi.fn().mockReturnValue(new Promise<Response>((r) => (answer = r)));
		const store = new NewsBadgeStore(load.read, { fetch: fetcher as typeof fetch });

		const inFlight = store.refresh();
		load.rerun({ count: 0, capped: false });
		answer(jsonResponse({ badge: { count: 2, capped: false } }));
		await inFlight;

		expect(store.label).toBe('');
	});

	it('lets a later load replace an answer it fetched earlier', async () => {
		const load = loadOf(null);
		const fetcher = vi.fn().mockResolvedValue(jsonResponse({ badge: { count: 2, capped: false } }));
		const store = new NewsBadgeStore(load.read, { fetch: fetcher as typeof fetch });
		await store.refresh();
		expect(store.label).toBe('2');

		load.rerun({ count: 0, capped: false });

		expect(store.label).toBe('');
	});

	it('records when it last asked, for the revalidation trigger', async () => {
		let now = 1_000;
		const fetcher = vi.fn().mockResolvedValue(jsonResponse({ badge: null }));
		const store = new NewsBadgeStore(() => null, {
			fetch: fetcher as typeof fetch,
			now: () => now
		});
		expect(store.checkedAt).toBe(1_000);

		now = 5_000;
		await store.refresh();

		expect(store.checkedAt).toBe(5_000);
	});
});
