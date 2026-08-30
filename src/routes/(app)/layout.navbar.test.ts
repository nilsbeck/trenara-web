import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import type { User } from '$lib/server/trenara/types';
import Layout from './+layout.svelte';

/**
 * The navbar is a name and a picture, and it must not move.
 *
 * It used to be streamed — the load returned `userData` as a promise, so the
 * value was *always* pending first and the navbar rendered a spinner before
 * swapping in a name that had been the same all day. That happened on every
 * full page load, and again on every re-run of the layout load: `depends`
 * covers the whole load, so `invalidate('app:news')` — fired by the news page
 * and by every dashboard background refresh — handed the component a fresh
 * pending promise.
 *
 * Resolving it in the load puts it in the server-rendered HTML, which is the
 * only way for it not to flicker. These pin that it stays resolved.
 */

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(), invalidateAll: vi.fn() }));

const children = createRawSnippet(() => ({ render: () => '<main>the page</main>' }));

function user(firstName: string): User {
	return {
		id: 56540,
		first_name: firstName,
		profile_picture: { path: 'https://example.test/nils.jpg' }
	} as unknown as User;
}

/** One run of the layout load, as the component receives it. */
function loadResult(
	userData: User | null,
	newsBadge: { count: number; capped: boolean } | null = null
) {
	return {
		userData,
		newsBadge,
		// Still streamed, and deliberately: it feeds the collapsed bubble in the
		// corner, not the navbar, and awaiting it would cost a request per page.
		chatBadge: Promise.resolve({ threads: [], seen: {} }),
		appConfig: Promise.resolve(null)
	};
}

function show(data: ReturnType<typeof loadResult>) {
	return render(Layout, { children, data } as never);
}

beforeEach(() => {
	// The chat bubble polls on mount; nothing here is about chat.
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('the navbar', () => {
	// Synchronously, in the first render — no `waitFor`, which is the point.
	it('has the name and the avatar in the first paint', () => {
		show(loadResult(user('Nils')));

		expect(screen.getByText(/Hi, Nils!/)).toBeTruthy();
		expect((screen.getByAltText('Profile') as HTMLImageElement).src).toBe(
			'https://example.test/nils.jpg'
		);
	});

	// A streamed value renders a spinner first. A resolved one never does.
	it('never shows a loading state for a name it already has', () => {
		const { container } = show(loadResult(user('Nils')));
		expect(container.querySelector('.animate-spin')).toBeNull();
	});

	// The re-runs: `invalidate('app:news')` from the news page and from every
	// dashboard refresh. Same account, so nothing may move.
	it('does not move when the load re-runs with the same account', async () => {
		const { rerender, container } = show(loadResult(user('Nils')));
		const avatarBefore = screen.getByAltText('Profile');

		await rerender({ children, data: loadResult(user('Nils')) } as never);

		expect(screen.getByText(/Hi, Nils!/)).toBeTruthy();
		expect(container.querySelector('.animate-spin')).toBeNull();
		// The same element, not a replacement — a new <img> would re-request.
		expect(screen.getByAltText('Profile')).toBe(avatarBefore);
	});

	it('takes a new account when a re-run genuinely brings one', async () => {
		const { rerender } = show(loadResult(user('Nils')));

		await rerender({ children, data: loadResult(user('Niels')) } as never);

		expect(screen.getByText(/Hi, Niels!/)).toBeTruthy();
	});

	// The dot sits on the same button as the avatar. Streamed, it was absent
	// from the first paint and appeared afterwards — two things settling at
	// different times on one control is the flicker, whichever is late.
	it('has the unread dot in the first paint too', () => {
		show(loadResult(user('Nils'), { count: 3, capped: false }));

		const menu = screen.getByRole('button', { name: /3 unread news items/i });
		expect(menu).toBeTruthy();
	});

	it('does not move the dot when the load re-runs with the same count', async () => {
		const { rerender } = show(loadResult(user('Nils'), { count: 3, capped: false }));
		const before = screen.getByRole('button', { name: /3 unread news items/i });

		await rerender({
			children,
			data: loadResult(user('Nils'), { count: 3, capped: false })
		} as never);

		expect(screen.getByRole('button', { name: /3 unread news items/i })).toBe(before);
	});

	// Chrome on every page must never be able to take a page down, so the load
	// resolves this to null rather than throwing.
	it('says so, rather than spinning, when there is no account to show', () => {
		const { container } = show(loadResult(null));

		expect(screen.getByText('Could not load user data')).toBeTruthy();
		expect(container.querySelector('.animate-spin')).toBeNull();
	});
});
