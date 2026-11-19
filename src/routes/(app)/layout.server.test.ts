import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { load } from './+layout.server';

/**
 * The signed-in shell's load: what it awaits, what it streams, and that the
 * two things it awaits are awaited together.
 */

const upstream = vi.hoisted(() => ({
	release: () => {},
	user: Promise.resolve({ id: 7, first_name: 'Ada' }) as Promise<unknown>,
	newsBadgeCalls: 0
}));

vi.mock('#lib/server/trenara/index.js', () => ({
	userApi: { getCurrentUser: () => upstream.user },
	configApi: { getAppConfig: () => Promise.resolve({ surfaces: [] }) }
}));
vi.mock('#lib/server/news/badge.js', () => ({
	newsBadgeIfReady: () => {
		upstream.newsBadgeCalls++;
		return Promise.resolve(3);
	}
}));
vi.mock('#lib/server/chat/badge.js', () => ({
	loadChatBadge: () => Promise.resolve({ threads: [], seen: {} })
}));

function event() {
	return {
		cookies: {} as Cookies,
		locals: { user: { id: 7, email: 'runner@example.com' } },
		depends: vi.fn()
	} as unknown as Parameters<typeof load>[0];
}

beforeEach(() => {
	upstream.newsBadgeCalls = 0;
	upstream.user = Promise.resolve({ id: 7, first_name: 'Ada' });
});

describe('(app) layout load', () => {
	/**
	 * Agents.md §7: reads that do not depend on each other run together. The
	 * badge does not need the account, but it was only asked for once the
	 * account had arrived.
	 */
	it('asks for the news badge without waiting for the account', async () => {
		upstream.user = new Promise((resolve) => {
			upstream.release = () => resolve({ id: 7, first_name: 'Ada' });
		});

		const loading = load(event());
		await Promise.resolve();

		expect(upstream.newsBadgeCalls).toBe(1);

		upstream.release();
		await loading;
	});

	it('awaits the chrome and streams the rest', async () => {
		const data = (await load(event())) as Record<string, unknown>;

		expect(data.userData).toEqual({ id: 7, first_name: 'Ada' });
		expect(data.newsBadge).toBe(3);
		expect(data.chatBadge).toBeInstanceOf(Promise);
		expect(data.appConfig).toBeInstanceOf(Promise);
	});

	it('renders the navbar without an account rather than failing the page', async () => {
		upstream.user = Promise.reject(new Error('Trenara unreachable'));

		const data = (await load(event())) as Record<string, unknown>;

		expect(data.userData).toBeNull();
		expect(data.newsBadge).toBe(3);
	});
});
