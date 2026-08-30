import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import type { ChatThread } from '$lib/server/trenara/types';
import { loadChatBadge } from './badge';
import { DatabaseError } from '$lib/server/db/errors';

const { getThreads, getMarks, advanceMark } = vi.hoisted(() => ({
	getThreads: vi.fn(),
	getMarks: vi.fn(),
	advanceMark: vi.fn()
}));

vi.mock('$lib/server/trenara', () => ({ chatApi: { getThreads } }));
vi.mock('$lib/server/db/chat-read-state', () => ({
	chatReadStateDAO: { getMarks, advanceMark }
}));

const cookies = {} as Cookies;
const USER = 56540;

function thread(id: number, unread: number, lastMessageId?: number): ChatThread {
	return {
		id,
		type: 'coach',
		title: `Thread ${id}`,
		sub_title: '',
		total_messages: 10,
		unread_messages: unread,
		can_send_messages: true,
		disabled: false,
		last_message:
			lastMessageId === undefined
				? undefined
				: {
						id: lastMessageId,
						body: 'hi',
						body_html: '<p>hi</p>',
						created_at: 1700000000,
						user_id: 3,
						picture_url: ''
					}
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	getMarks.mockResolvedValue(new Map<number, number>());
	advanceMark.mockResolvedValue({ advanced: true });
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('loadChatBadge', () => {
	it('hands back the threads with the reader stored position in each', async () => {
		getThreads.mockResolvedValue([thread(1, 2, 101), thread(2, 0, 55)]);
		getMarks.mockResolvedValue(
			new Map([
				[1, 90],
				[2, 55]
			])
		);

		expect(await loadChatBadge(cookies, USER)).toEqual({
			threads: [thread(1, 2, 101), thread(2, 0, 55)],
			seen: { 1: 90, 2: 55 }
		});
		expect(advanceMark).not.toHaveBeenCalled();
	});

	// Trenara's unread count does not clear when a conversation is read here, so
	// an unseeded reader would be greeted by a badge for conversations they
	// finished long ago.
	it('seeds a thread it has never seen the reader in, and reports it read', async () => {
		getThreads.mockResolvedValue([thread(1, 7, 101)]);

		const badge = await loadChatBadge(cookies, USER);

		expect(badge.seen).toEqual({ 1: 101 });
		expect(advanceMark).toHaveBeenCalledWith(USER, 1, 101);
	});

	it('seeds an empty thread at zero, so its first message counts', async () => {
		getThreads.mockResolvedValue([thread(1, 0)]);

		const badge = await loadChatBadge(cookies, USER);

		expect(badge.seen).toEqual({ 1: 0 });
		expect(advanceMark).toHaveBeenCalledWith(USER, 1, 0);
	});

	it('seeds only the threads without a mark', async () => {
		getThreads.mockResolvedValue([thread(1, 1, 101), thread(2, 1, 202)]);
		getMarks.mockResolvedValue(new Map([[1, 90]]));

		const badge = await loadChatBadge(cookies, USER);

		expect(badge.seen).toEqual({ 1: 90, 2: 202 });
		expect(advanceMark).toHaveBeenCalledTimes(1);
		expect(advanceMark).toHaveBeenCalledWith(USER, 2, 202);
	});

	// The badge is an ornament on every page in the app. Chat being unreachable
	// is not the page's problem.
	it('comes back empty when the thread list cannot be fetched', async () => {
		getThreads.mockRejectedValue(new Error('upstream down'));

		expect(await loadChatBadge(cookies, USER)).toEqual({ threads: [], seen: {} });
	});
});

describe('when the database raises instead of swallowing', () => {
	// The DAOs now report a failed write rather than returning it as a no-op.
	// The badge is the one caller that must not care: it is chrome on every
	// page, and its own contract is that a database down means an empty bubble,
	// never a page that will not render.
	it('still comes back empty rather than failing the layout', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		getThreads.mockResolvedValue([thread(1, 2, 900)]);
		getMarks.mockResolvedValue(new Map());
		advanceMark.mockRejectedValue(new DatabaseError('chat mark write', 'down'));

		await expect(loadChatBadge(cookies, USER)).resolves.toEqual({ threads: [], seen: {} });
	});

	it('is equally unbothered when the marks cannot be read', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		getThreads.mockResolvedValue([thread(1, 2, 900)]);
		getMarks.mockRejectedValue(new DatabaseError('chat marks read', 'down'));

		await expect(loadChatBadge(cookies, USER)).resolves.toEqual({ threads: [], seen: {} });
	});
});
