import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/svelte';

const state = vi.hoisted(() => ({
	page: { url: new URL('https://trainara.example/goal') }
}));

const mockInvalidateAll = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('$app/state', () => ({ page: state.page }));
vi.mock('$app/navigation', () => ({ invalidateAll: mockInvalidateAll }));

import GoalCardShare from './goal-card-share.svelte';

const shareRow = { token: 'a'.repeat(43), title: 'Race day' };

// jsdom ships <dialog> without showModal/close, so a component that opens one
// cannot be driven at all without this — same stub as the other dialogs use.
beforeAll(() => {
	const proto = window.HTMLDialogElement.prototype;
	if (!proto.showModal) {
		proto.showModal = function (this: HTMLDialogElement) {
			this.open = true;
		};
	}
	if (!proto.close) {
		proto.close = function (this: HTMLDialogElement) {
			this.open = false;
			this.dispatchEvent(new Event('close'));
		};
	}
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

beforeEach(() => {
	mockInvalidateAll.mockClear();
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }))
	);
});

function openDialog() {
	fireEvent.click(screen.getByRole('button', { name: /^share$/i }));
}

describe('goal card share dialog, no live link', () => {
	it('offers a title field and a create action, with no fetch on mount', () => {
		render(GoalCardShare, { props: { share: null } });
		expect(fetch).not.toHaveBeenCalled();

		openDialog();
		expect(screen.getByRole('button', { name: /create link/i })).toBeTruthy();
	});

	it('creates a link and refreshes the page data through invalidateAll', async () => {
		render(GoalCardShare, { props: { share: null } });
		openDialog();

		await fireEvent.click(screen.getByTestId('create-button'));

		await waitFor(() => expect(mockInvalidateAll).toHaveBeenCalledTimes(1));
		expect(fetch).toHaveBeenCalledWith(
			'/api/v1/goal-share',
			expect.objectContaining({ method: 'POST' })
		);
	});

	it('disables the button and shows a pending state while the request is in flight', async () => {
		let release!: () => void;
		const held = new Promise<void>((resolve) => (release = resolve));
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				await held;
				return new Response(JSON.stringify({}), { status: 200 });
			})
		);

		render(GoalCardShare, { props: { share: null } });
		openDialog();

		const button = screen.getByTestId('create-button') as HTMLButtonElement;
		fireEvent.click(button);

		await waitFor(() => expect(button.disabled).toBe(true));
		expect(screen.getByRole('status')).toBeTruthy();

		release();
		await waitFor(() => expect(mockInvalidateAll).toHaveBeenCalled());
	});

	it('shows the failure in place rather than leaving the dialog looking untouched', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () => new Response(JSON.stringify({ message: 'Too many updates.' }), { status: 429 })
			)
		);

		render(GoalCardShare, { props: { share: null } });
		openDialog();
		await fireEvent.click(screen.getByTestId('create-button'));

		expect(await screen.findByRole('alert')).toHaveTextContent(/too many updates/i);
		expect(mockInvalidateAll).not.toHaveBeenCalled();
	});
});

describe('goal card share dialog, a live link', () => {
	it('shows the share URL, built from the page origin and the token', () => {
		render(GoalCardShare, { props: { share: shareRow } });
		openDialog();

		const input = screen.getByDisplayValue(
			`https://trainara.example/s/${shareRow.token}`
		) as HTMLInputElement;
		expect(input.readOnly).toBe(true);
	});

	it('offers rotate and revoke, not a title field', () => {
		render(GoalCardShare, { props: { share: shareRow } });
		openDialog();

		expect(screen.getByTestId('rotate-button')).toBeTruthy();
		expect(screen.getByTestId('revoke-button')).toBeTruthy();
		expect(screen.queryByPlaceholderText(/e\.g\. berlin marathon/i)).toBeNull();
	});

	it('rotates the token and refreshes through invalidateAll', async () => {
		render(GoalCardShare, { props: { share: shareRow } });
		openDialog();

		await fireEvent.click(screen.getByTestId('rotate-button'));

		await waitFor(() => expect(mockInvalidateAll).toHaveBeenCalledTimes(1));
		expect(fetch).toHaveBeenCalledWith(
			'/api/v1/goal-share',
			expect.objectContaining({ method: 'PUT' })
		);
	});

	it('revokes and refreshes through invalidateAll', async () => {
		render(GoalCardShare, { props: { share: shareRow } });
		openDialog();

		await fireEvent.click(screen.getByTestId('revoke-button'));

		await waitFor(() => expect(mockInvalidateAll).toHaveBeenCalledTimes(1));
		expect(fetch).toHaveBeenCalledWith(
			'/api/v1/goal-share',
			expect.objectContaining({ method: 'DELETE' })
		);
	});

	it('confirms a copy, falling back to selecting the text when the Clipboard API is unavailable', async () => {
		render(GoalCardShare, { props: { share: shareRow } });
		openDialog();

		const input = screen.getByDisplayValue(
			`https://trainara.example/s/${shareRow.token}`
		) as HTMLInputElement;
		const selectSpy = vi.spyOn(input, 'select');

		await fireEvent.click(screen.getByRole('button', { name: /copy/i }));

		// jsdom carries no Clipboard API, so `copyLink`'s catch branch is what
		// actually runs here — which is the fallback this test exists to check.
		expect(selectSpy).toHaveBeenCalled();
	});
});
