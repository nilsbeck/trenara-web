import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import AddTraining from '$lib/components/training/add-training.svelte';

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

const recovery = {
	id: 24180,
	title: 'Recovery run',
	description: 'A second recovery run this week, because... why not?',
	hex_training: '#90CFF1',
	day_long: '2026-10-10',
	training: { blocks: [], total_distance: '8km', total_time: '47:27' }
};

function stubFetch(...answers: Array<() => Promise<Response> | Response>) {
	const fetchMock = vi.fn();
	for (const answer of answers) fetchMock.mockImplementationOnce(async () => answer());
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

async function openPicker() {
	await fireEvent.click(screen.getByRole('button', { name: /add a training/i }));
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('AddTraining', () => {
	it('offers to add a training and asks for nothing until tapped', () => {
		const fetchMock = stubFetch();
		render(AddTraining, { date: '2026-10-10', onAdded: vi.fn() });

		expect(screen.getByRole('button', { name: /add a training/i })).toBeTruthy();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('says what it is waiting for while the list is out', async () => {
		stubFetch(() => new Promise<Response>(() => {}));
		render(AddTraining, { date: '2026-10-10', onAdded: vi.fn() });

		await openPicker();

		const loading = screen.getByTestId('add-training-loading');
		expect(loading.getAttribute('role')).toBe('status');
		expect(loading.textContent).toContain('Loading the sessions you can add');
	});

	it('lists the candidates with their distance and time', async () => {
		stubFetch(() => json({ canAdd: true, candidates: [recovery] }));
		render(AddTraining, { date: '2026-10-10', onAdded: vi.fn() });

		await openPicker();

		const option = await screen.findByRole('button', { name: /recovery run/i });
		expect(option.textContent).toContain('8km · 47:27');
		expect(screen.queryByTestId('add-training-loading')).toBeNull();
	});

	it('says the week is full rather than showing an empty list', async () => {
		stubFetch(() => json({ canAdd: false, candidates: [] }));
		render(AddTraining, { date: '2026-10-10', onAdded: vi.fn() });

		await openPicker();

		expect(await screen.findByText(/already has as many sessions/i)).toBeTruthy();
		expect(screen.queryByTestId('add-training-loading')).toBeNull();
	});

	it('says when there is nothing on offer for the day', async () => {
		stubFetch(() => json({ canAdd: true, candidates: [] }));
		render(AddTraining, { date: '2026-10-10', onAdded: vi.fn() });

		await openPicker();

		expect(await screen.findByText(/no session to offer/i)).toBeTruthy();
		expect(screen.queryByTestId('add-training-loading')).toBeNull();
	});

	it('stops loading and offers a retry when the list fails', async () => {
		stubFetch(() => json({ message: 'Trenara could not be reached. Please try again.' }, 502));
		render(AddTraining, { date: '2026-10-10', onAdded: vi.fn() });

		await openPicker();

		expect(await screen.findByRole('button', { name: /try again/i })).toBeTruthy();
		expect(screen.queryByTestId('add-training-loading')).toBeNull();
	});

	it('adds the picked session and tells the owner to refresh the plan', async () => {
		const fetchMock = stubFetch(
			() => json({ canAdd: true, candidates: [recovery] }),
			() => json({ id: 133797044, title: 'Recovery run' })
		);
		const onAdded = vi.fn();
		render(AddTraining, { date: '2026-10-10', onAdded });

		await openPicker();
		await fireEvent.click(await screen.findByRole('button', { name: /recovery run/i }));

		await waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
		const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
		expect(url).toBe('/api/v1/training/new');
		expect(JSON.parse(String(init.body))).toEqual({ date: '2026-10-10', candidateId: 24180 });
		// Back to the closed card; the refreshed plan puts the session on the day.
		expect(screen.getByRole('button', { name: /add a training/i })).toBeTruthy();
	});

	it('keeps the list and says why when the add is refused', async () => {
		stubFetch(
			() => json({ canAdd: true, candidates: [recovery] }),
			() => json({ message: 'This week cannot take another training.' }, 409)
		);
		const onAdded = vi.fn();
		render(AddTraining, { date: '2026-10-10', onAdded });

		await openPicker();
		await fireEvent.click(await screen.findByRole('button', { name: /recovery run/i }));

		expect((await screen.findByRole('alert')).textContent).toContain('cannot take another');
		expect(screen.getByRole('button', { name: /recovery run/i })).toBeTruthy();
		expect(onAdded).not.toHaveBeenCalled();
	});
});
