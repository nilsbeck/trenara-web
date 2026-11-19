import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/svelte';
import type { ChatThread } from '#lib/server/trenara/types.js';
import ChatBubble from './chat-bubble.svelte';

/**
 * The chat window as a lazy chunk: left out of the shell, warmed when the page
 * is idle, mounted on the first tap — and what the bubble shows while a tap
 * has beaten the warm-up, or when the chunk cannot be had at all.
 *
 * The load is controlled through `loadOnce`, which the bubble's module script
 * wraps its `import()` in: each call here waits on `panel.gate` and then
 * either fails or performs the real import. Nothing is cached between calls,
 * so every case's tap is a first load.
 */

const panel = vi.hoisted(() => {
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

const reload = vi.hoisted(() => vi.fn());

vi.mock('#lib/utils/load-once.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/utils/load-once.js')>()),
	loadOnce:
		<T>(load: () => Promise<T>) =>
		async () => {
			await panel.gate;
			if (panel.fail) throw new TypeError('Failed to fetch dynamically imported module');
			return load();
		},
	// No idle warm-up, so the tap is what asks for the window.
	whenIdle: () => () => {},
	reloadOnStaleChunk: reload
}));

const THREAD = {
	id: 1,
	type: 'coach',
	title: 'Coach Walter',
	sub_title: 'Coach',
	total_messages: 1,
	unread_messages: 0,
	can_send_messages: true,
	disabled: false,
	last_message: null
} as unknown as ChatThread;

function serve() {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL) =>
			String(input).includes('/messages')
				? new Response(JSON.stringify({ data: [] }), { status: 200 })
				: new Response(JSON.stringify([THREAD]), { status: 200 })
		)
	);
}

afterEach(() => {
	// A case that held the window back must not leave the load pending.
	panel.release();
	panel.gate = Promise.resolve();
	panel.fail = false;
	reload.mockReset();
	cleanup();
	vi.unstubAllGlobals();
});

describe('the chat window, loaded on demand', () => {
	it('says what is waiting while the window is still on its way', async () => {
		serve();
		panel.hold();
		render(ChatBubble, { currentUserId: 7, initialThreads: [THREAD] });

		await fireEvent.click(screen.getByLabelText('Open chat'));

		const pending = screen.getByTestId('chat-panel-loading');
		expect(pending.getAttribute('role')).toBe('status');
		expect(pending.textContent).toContain('Opening the chat');
	});

	it('replaces the placeholder with the window once it has loaded', async () => {
		serve();
		panel.hold();
		render(ChatBubble, { currentUserId: 7, initialThreads: [THREAD] });

		await fireEvent.click(screen.getByLabelText('Open chat'));
		panel.release();

		await waitFor(() => expect(screen.getByText('Coach Walter')).toBeTruthy());
		expect(screen.queryByTestId('chat-panel-loading')).toBeNull();
	});

	it('reloads the page when the window cannot be fetched, rather than spinning forever', async () => {
		serve();
		panel.fail = true;
		render(ChatBubble, { currentUserId: 7, initialThreads: [THREAD] });

		await fireEvent.click(screen.getByLabelText('Open chat'));

		await waitFor(() => expect(reload).toHaveBeenCalled());
	});
});
