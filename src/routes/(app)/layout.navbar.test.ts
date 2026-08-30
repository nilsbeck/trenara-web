import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import type { User } from '$lib/server/trenara/types';
import Layout from './+layout.svelte';

/**
 * The layout load re-runs far more often than a navigation does.
 *
 * `depends('app:news')` covers the whole load, so `invalidate('app:news')` —
 * fired by the dashboard on every background refresh — hands the component a
 * fresh set of promises for an account that has not changed. Read straight
 * from those, the navbar blanked and re-rendered every time.
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
function loadResult(userData: Promise<User>) {
	return {
		userData,
		newsBadge: Promise.resolve(null),
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

describe('the navbar across a re-run of the layout load', () => {
	it('shows the runner once their account arrives', async () => {
		show(loadResult(Promise.resolve(user('Nils'))));

		await waitFor(() => expect(screen.getByText(/Hi, Nils!/)).toBeTruthy());
	});

	// The reported symptom: navigating, or any background refresh, sent the
	// greeting back to a spinner and re-rendered the avatar beside it.
	it('keeps the name on screen while a re-run is still in flight', async () => {
		const { rerender } = show(loadResult(Promise.resolve(user('Nils'))));
		await waitFor(() => expect(screen.getByText(/Hi, Nils!/)).toBeTruthy());

		// A re-run: same account, new promise, not yet settled.
		let settle: (value: User) => void = () => {};
		await rerender({
			children,
			data: loadResult(new Promise<User>((resolve) => (settle = resolve)))
		} as never);

		expect(screen.getByText(/Hi, Nils!/)).toBeTruthy();

		settle(user('Nils'));
		await waitFor(() => expect(screen.getByText(/Hi, Nils!/)).toBeTruthy());
	});

	it('keeps the avatar rather than dropping back to the placeholder', async () => {
		const { rerender } = show(loadResult(Promise.resolve(user('Nils'))));
		await waitFor(() => expect(screen.getByAltText('Profile')).toBeTruthy());

		await rerender({ children, data: loadResult(new Promise<User>(() => {})) } as never);

		const avatar = screen.getByAltText('Profile') as HTMLImageElement;
		expect(avatar.src).toBe('https://example.test/nils.jpg');
	});

	it('takes the new name when a re-run genuinely brings one', async () => {
		const { rerender } = show(loadResult(Promise.resolve(user('Nils'))));
		await waitFor(() => expect(screen.getByText(/Hi, Nils!/)).toBeTruthy());

		await rerender({ children, data: loadResult(Promise.resolve(user('Niels'))) } as never);

		await waitFor(() => expect(screen.getByText(/Hi, Niels!/)).toBeTruthy());
	});

	// A refresh that failed has not unmade the account.
	it('keeps the account when a later run fails', async () => {
		const { rerender } = show(loadResult(Promise.resolve(user('Nils'))));
		await waitFor(() => expect(screen.getByText(/Hi, Nils!/)).toBeTruthy());

		await rerender({ children, data: loadResult(Promise.reject(new Error('down'))) } as never);

		await new Promise((r) => setTimeout(r, 0));
		expect(screen.getByText(/Hi, Nils!/)).toBeTruthy();
		expect(screen.queryByText('Could not load user data')).toBeNull();
	});

	// But a first attempt that fails has nothing to keep, and should say so.
	it('reports a first load that failed', async () => {
		show(loadResult(Promise.reject(new Error('down'))));

		await waitFor(() => expect(screen.getByText('Could not load user data')).toBeTruthy());
	});
});
