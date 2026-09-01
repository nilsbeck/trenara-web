import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/svelte';
import DeleteGoalModal from './delete-goal-modal.svelte';

/**
 * Deleting the goal.
 *
 * The confirmation is the feature here, so it is what these pin: the dialog has
 * to say what goes and that nothing here brings it back, and the request must
 * not leave until it has been confirmed.
 */

beforeAll(() => {
	HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
		this.open = true;
	};
	HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
		this.open = false;
	};
});

function fetchMock() {
	return globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
}

function trigger() {
	return screen.getAllByRole('button', { name: /delete goal/i })[0];
}

function confirm() {
	return screen.getAllByRole('button', { name: /delete goal/i }).at(-1)!;
}

beforeEach(() => vi.stubGlobal('fetch', vi.fn()));

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('the delete-goal dialog', () => {
	it('sends nothing until the delete is confirmed', async () => {
		render(DeleteGoalModal, { props: { goalName: 'Valencia Marathon' } });
		await fireEvent.click(trigger());

		expect(fetchMock()).not.toHaveBeenCalled();
	});

	it('names the goal that is about to go', async () => {
		render(DeleteGoalModal, { props: { goalName: 'Valencia Marathon' } });
		await fireEvent.click(trigger());

		expect(screen.getByText('Valencia Marathon')).toBeTruthy();
	});

	it('says it cannot be undone from here', async () => {
		render(DeleteGoalModal, { props: {} });
		await fireEvent.click(trigger());

		expect(screen.getByText(/cannot be undone from here/i)).toBeTruthy();
	});

	it('DELETEs the goal and reports it', async () => {
		fetchMock().mockResolvedValue({
			ok: true,
			status: 200,
			json: () => Promise.resolve({ message: 'Success.' })
		} as unknown as Response);
		const onDeleted = vi.fn();

		render(DeleteGoalModal, { props: { goalName: 'Valencia Marathon', onDeleted } });
		await fireEvent.click(trigger());
		await fireEvent.click(confirm());

		await waitFor(() => expect(onDeleted).toHaveBeenCalled());

		const [url, init] = fetchMock().mock.calls.at(-1) as [string, RequestInit];
		expect(url).toBe('/api/v1/goal');
		expect(init.method).toBe('DELETE');
	});

	it('keeps the dialog on a refusal and shows what was said', async () => {
		fetchMock().mockResolvedValue({
			ok: false,
			status: 403,
			json: () => Promise.resolve({ message: 'Your coach owns this goal.' })
		} as unknown as Response);
		const onDeleted = vi.fn();

		render(DeleteGoalModal, { props: { onDeleted } });
		await fireEvent.click(trigger());
		await fireEvent.click(confirm());

		expect(await screen.findByRole('alert')).toHaveTextContent(/your coach owns this goal/i);
		expect(onDeleted).not.toHaveBeenCalled();
	});

	it('backs out without deleting', async () => {
		render(DeleteGoalModal, { props: {} });
		await fireEvent.click(trigger());
		await fireEvent.click(screen.getByRole('button', { name: /keep goal/i }));

		expect(fetchMock()).not.toHaveBeenCalled();
	});
});
