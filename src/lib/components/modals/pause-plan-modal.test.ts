import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/svelte';
import type { AppConfig } from '$lib/server/trenara/types';
import { appConfig } from '$lib/stores/app-config.svelte';
import PausePlanModal from './pause-plan-modal.svelte';

/**
 * The pause dialog: what it offers, what it sends, and what it says when the
 * write is refused.
 *
 * The three things worth pinning are the three that fail silently otherwise —
 * the radio posts the wire value rather than the label, the free-text follow-up
 * appears only for the reasons flagged for it, and a refusal is shown rather
 * than swallowed behind a closed dialog.
 */

// jsdom ships <dialog> without the modal methods; `open` is what keeps the
// content queryable once it is shown.
beforeAll(() => {
	HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
		this.open = true;
	};
	HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
		this.open = false;
	};
});

function ok(body: unknown = { message: 'Success.' }) {
	return { ok: true, status: 200, json: () => Promise.resolve(body) } as unknown as Response;
}

function refused(status: number, body: unknown) {
	return {
		ok: false,
		status,
		json: () => Promise.resolve(body)
	} as unknown as Response;
}

function fetchMock() {
	return globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
}

/** Opens the dialog and hands back the props' spy. */
async function open(onPaused = vi.fn()) {
	render(PausePlanModal, { props: { onPaused } });
	await fireEvent.click(screen.getByRole('button', { name: /pause plan/i }));
	return onPaused;
}

beforeEach(() => {
	vi.stubGlobal('fetch', vi.fn());
	appConfig.set(null);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	appConfig.set(null);
});

describe('the pause dialog', () => {
	it('offers the captured reasons when no config has arrived', async () => {
		await open();

		for (const label of ['Illness', 'Injury', 'Holiday', 'Motivation', 'Other']) {
			expect(screen.getByRole('radio', { name: label })).toBeTruthy();
		}
	});

	it('offers the served reasons over the captured ones', async () => {
		appConfig.set({
			pause_types: [
				{ order: 1, type: 'illness', title: 'Ziekte', ask_extra_input: false },
				{ order: 2, type: 'sabbatical', title: 'Sabbatical', ask_extra_input: false }
			]
		} as unknown as AppConfig);

		await open();

		expect(screen.getByRole('radio', { name: 'Sabbatical' })).toBeTruthy();
		expect(screen.queryByRole('radio', { name: 'Injury' })).toBeNull();
	});

	// Nothing is preselected: a reason picked by default is a reason nobody
	// chose, filed under the runner's name.
	it('will not submit until a reason is picked', async () => {
		await open();

		const submit = screen.getAllByRole('button', { name: /pause plan/i }).at(-1)!;
		expect((submit as HTMLButtonElement).disabled).toBe(true);
	});

	it('asks for words only on the reasons flagged for them', async () => {
		await open();

		await fireEvent.click(screen.getByRole('radio', { name: 'Holiday' }));
		expect(screen.queryByLabelText(/tell your coach more/i)).toBeNull();

		await fireEvent.click(screen.getByRole('radio', { name: 'Other' }));
		expect(screen.getByLabelText(/tell your coach more/i)).toBeTruthy();
	});

	it('holds the submit until a reason that asks for words has them', async () => {
		await open();
		await fireEvent.click(screen.getByRole('radio', { name: 'Other' }));

		const submit = screen
			.getAllByRole('button', { name: /pause plan/i })
			.at(-1)! as HTMLButtonElement;
		expect(submit.disabled).toBe(true);

		await fireEvent.input(screen.getByLabelText(/tell your coach more/i), {
			target: { value: 'Taking a break.' }
		});
		expect(submit.disabled).toBe(false);
	});

	// The label is localised upstream; the value is the contract.
	it('posts the wire value and the trimmed follow-up', async () => {
		fetchMock().mockResolvedValue(ok());
		const onPaused = await open();

		await fireEvent.click(screen.getByRole('radio', { name: 'Other' }));
		await fireEvent.input(screen.getByLabelText(/tell your coach more/i), {
			target: { value: '  Need a rest.  ' }
		});
		await fireEvent.click(screen.getAllByRole('button', { name: /pause plan/i }).at(-1)!);

		await waitFor(() => expect(onPaused).toHaveBeenCalled());

		const [url, init] = fetchMock().mock.calls.at(-1) as [string, RequestInit];
		expect(url).toBe('/api/v1/goal/pause');
		expect(init.method).toBe('POST');
		expect(JSON.parse(String(init.body))).toEqual({ type: 'other', extraInput: 'Need a rest.' });
	});

	it('sends an empty follow-up for a reason that does not ask for one', async () => {
		fetchMock().mockResolvedValue(ok());
		const onPaused = await open();

		await fireEvent.click(screen.getByRole('radio', { name: 'Holiday' }));
		await fireEvent.click(screen.getAllByRole('button', { name: /pause plan/i }).at(-1)!);

		await waitFor(() => expect(onPaused).toHaveBeenCalled());

		const [, init] = fetchMock().mock.calls.at(-1) as [string, RequestInit];
		expect(JSON.parse(String(init.body))).toEqual({ type: 'holiday', extraInput: '' });
	});

	it('shows the refusal the server worded, and does not report a pause', async () => {
		fetchMock().mockResolvedValue(
			refused(422, { message: 'extra_input: This field is required.' })
		);
		const onPaused = await open();

		await fireEvent.click(screen.getByRole('radio', { name: 'Illness' }));
		await fireEvent.click(screen.getAllByRole('button', { name: /pause plan/i }).at(-1)!);

		expect(await screen.findByRole('alert')).toHaveTextContent(/this field is required/i);
		expect(onPaused).not.toHaveBeenCalled();
	});

	it('says the connection failed rather than repeating the browser at the runner', async () => {
		fetchMock().mockRejectedValue(new TypeError('Failed to fetch'));
		await open();

		await fireEvent.click(screen.getByRole('radio', { name: 'Illness' }));
		await fireEvent.click(screen.getAllByRole('button', { name: /pause plan/i }).at(-1)!);

		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toMatch(/could not reach the server|offline/i);
		expect(alert.textContent).not.toMatch(/failed to fetch/i);
	});
});
