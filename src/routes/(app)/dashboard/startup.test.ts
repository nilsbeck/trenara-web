import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Handle } from '@sveltejs/kit/hooks';
import type { RequestEvent } from '@sveltejs/kit';
import { serverTiming } from '#lib/server/timing.js';

/**
 * A dashboard load, timed end to end against a Trenara that takes as long as
 * it says below — the real hooks, the real load, simulated time.
 *
 * This is the measurement the preview's `Server-Timing` header makes against
 * the real Trenara, made here against a fixed one so it can be asserted: how
 * long the server takes to have the page's data, from the request arriving.
 */

const ACCOUNT_MS = 200;
const READ_MS = 300;

function after<T>(ms: number, value: T): Promise<T> {
	return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

const week = {
	id: 1,
	start_day: 0,
	start_day_long: '',
	training_week: 1,
	type: 'ultimate',
	trainings: [],
	strength_trainings: [],
	entries: []
};

const upstream = vi.hoisted(() => ({ status: 'valid' as string, accountFails: false }));

vi.mock('$app/env', () => ({ dev: false }));
vi.mock('#lib/server/auth/token-manager.js', () => ({
	TokenManager: {
		getInstance: () => ({
			hasSessionCookies: () => true,
			validateAndRefreshToken: async () => upstream.status,
			logout: async () => {}
		})
	}
}));
vi.mock('#lib/server/trenara/user.js', () => ({
	userApi: {
		getCurrentUser: () =>
			upstream.accountFails
				? after(ACCOUNT_MS, null).then(() => Promise.reject(new Error('401')))
				: after(ACCOUNT_MS, { id: 42, email: 'runner@example.com' })
	}
}));
vi.mock('#lib/server/trenara/index.js', () => ({
	trainingApi: {
		getSchedule: () => after(READ_MS, week),
		getGoal: () => after(READ_MS, null)
	},
	userApi: { getUserStats: () => after(READ_MS, null) }
}));
vi.mock('#lib/server/history/record.js', () => ({ keepHistory: () => Promise.resolve() }));
vi.mock('#lib/server/after-response.js', () => ({ afterResponse: () => {} }));
vi.mock('#lib/server/history/goal-card-data.js', () => ({
	readGoalChart: async () => ({ records: [], error: null }),
	readGoalShare: async () => null
}));

function compose(...chain: Handle[]): Handle {
	return chain.reduceRight<Handle>(
		(next, current) =>
			({ event, resolve }) =>
				current({ event, resolve: async (e) => next({ event: e, resolve }) }),
		({ event, resolve }) => resolve(event)
	);
}

function dashboardRequest(): RequestEvent {
	return {
		route: { id: '/(app)/dashboard' },
		url: new URL('https://trainara.test/dashboard'),
		cookies: { get: () => undefined },
		locals: {},
		request: new Request('https://trainara.test/dashboard'),
		isDataRequest: false
	} as unknown as RequestEvent;
}

/** Run the request and report the simulated time the server took, and its header. */
async function serve(event = dashboardRequest()) {
	const hooks = await import('../../../hooks.server');
	const { load } = await import('./+page.server');
	const handle = compose(serverTiming, hooks.handleAuth, hooks.handleGuard);

	const startedAt = Date.now();
	let tookMs = -1;
	const outcome = Promise.resolve(
		handle({
			event,
			resolve: async (e) => {
				await load(e as Parameters<typeof load>[0]);
				return new Response('page');
			}
		})
	).then(
		(response: Response) => {
			tookMs = Date.now() - startedAt;
			return { response, thrown: null as { status: number } | null };
		},
		(thrown: { status: number }) => {
			tookMs = Date.now() - startedAt;
			return { response: null, thrown };
		}
	);

	await vi.runAllTimersAsync();
	return { ...(await outcome), tookMs };
}

beforeEach(() => {
	upstream.status = 'valid';
	upstream.accountFails = false;
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
});

afterEach(() => {
	vi.useRealTimers();
});

describe('a dashboard load, against a Trenara of fixed latency', () => {
	/**
	 * The identity check used to come first and the dashboard's reads after
	 * it: 200 ms, then 300 ms, before the page could be rendered. The reads
	 * need only the token, so they now start alongside it, and the server has
	 * its data when the slower of the two answers.
	 */
	it('has its data when the slower of the identity check and the reads answers', async () => {
		const { response, tookMs } = await serve();

		expect(response?.status).toBe(200);
		expect(tookMs).toBe(Math.max(ACCOUNT_MS, READ_MS));
		expect(response?.headers.get('server-timing')).toMatch(/schedule;dur=300\.0;desc="\+0ms"/);
	});

	it('keeps the old order when the token has just been refreshed', async () => {
		upstream.status = 'refreshed';

		const { tookMs } = await serve();

		expect(tookMs).toBe(ACCOUNT_MS + READ_MS);
	});

	it('sends a runner whose account read fails to sign in, with nothing read reaching a page', async () => {
		upstream.accountFails = true;

		const { response, thrown } = await serve();

		expect(response).toBeNull();
		expect(thrown?.status).toBe(302);
	});
});
