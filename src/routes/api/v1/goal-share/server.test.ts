import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { HttpError } from '$lib/server/trenara/client';
import { POST, PUT, DELETE } from './+server';

const mockGetGoal = vi.fn();
const mockGetCurrentUser = vi.fn();
const mockGetUserStats = vi.fn();

vi.mock('$lib/server/trenara', () => ({
	trainingApi: { getGoal: (...args: unknown[]) => mockGetGoal(...args) },
	userApi: {
		getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
		getUserStats: (...args: unknown[]) => mockGetUserStats(...args)
	}
}));

const mockGetForGoal = vi.fn();
const mockIssue = vi.fn();
const mockRevoke = vi.fn();
const mockRefreshSnapshot = vi.fn();

vi.mock('$lib/server/db/goal-share', () => ({
	goalShareDAO: {
		getForGoal: (...args: unknown[]) => mockGetForGoal(...args),
		issue: (...args: unknown[]) => mockIssue(...args),
		revoke: (...args: unknown[]) => mockRevoke(...args),
		refreshSnapshot: (...args: unknown[]) => mockRefreshSnapshot(...args)
	}
}));

const mockCheck = vi.fn();
vi.mock('$lib/server/security/rate-limit', () => ({
	storageWrites: { check: (...args: unknown[]) => mockCheck(...args) }
}));

const user = { id: 42, email: 'nils@example.com' };

const goal = {
	id: 7,
	name: 'Berlin Marathon',
	start_date: '2026-01-06',
	end_date: '2026-09-27',
	distance: '42.195 km',
	distance_unit: 'km',
	distance_value: 42.195,
	time: '3:30:00',
	time_in_sec: 12600,
	pace: '5:00 min/km'
};

const account = { id: 1, first_name: 'Nils' };

const shareRow = {
	id: 5,
	user_id: 42,
	goal_id: 7,
	token: 'a'.repeat(43),
	title: null,
	display_name: 'Nils',
	snapshot: null,
	snapshot_at: null,
	revoked_at: null,
	created_at: '2026-08-01T00:00:00Z'
};

function makeEvent(overrides: {
	method: 'POST' | 'PUT' | 'DELETE';
	body?: unknown;
	locals?: { user: typeof user | null };
}) {
	const request = {
		json: async () => (overrides.body === undefined ? {} : overrides.body)
	} as unknown as Request;

	return {
		cookies: {} as Cookies,
		request,
		locals: overrides.locals ?? { user },
		url: new URL('https://trainara.example/api/v1/goal-share'),
		getClientAddress: () => '203.0.113.1'
	} as never;
}

beforeEach(() => {
	vi.clearAllMocks();
	mockCheck.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
	mockGetGoal.mockResolvedValue(goal);
	mockGetCurrentUser.mockResolvedValue(account);
	mockGetUserStats.mockResolvedValue({
		best_times: { time_for_goal: '3:35:00', pace_for_goal: '5:06 min/km' },
		graph_stats: {
			goal: {
				data: [],
				done: '0 km',
				done_value: 0,
				done_unit: 'km',
				done_unit_text: 'km',
				todo: '0 km',
				todo_value: 0,
				todo_unit: 'km',
				todo_unit_text: 'km'
			}
		}
	});
	mockGetForGoal.mockResolvedValue(null);
	mockIssue.mockResolvedValue(shareRow);
	mockRevoke.mockResolvedValue({ revoked: true });
	mockRefreshSnapshot.mockResolvedValue({ written: false });
});

describe('POST /api/v1/goal-share', () => {
	it('requires a session', async () => {
		await expect(POST(makeEvent({ method: 'POST', locals: { user: null } }))).rejects.toThrow();
	});

	it('reads the goal id from Trenara, never from the request body', async () => {
		await POST(makeEvent({ method: 'POST', body: { goalId: 999, title: 'Mine' } }));
		expect(mockIssue).toHaveBeenCalledWith(42, 7, expect.objectContaining({ title: 'Mine' }));
	});

	it('trims and caps the title', async () => {
		await POST(makeEvent({ method: 'POST', body: { title: `  ${'x'.repeat(100)}  ` } }));
		const written = mockIssue.mock.calls[0][2].title as string;
		expect(written).toHaveLength(80);
		expect(written).not.toMatch(/^\s|\s$/);
	});

	it('reads an empty body as no title', async () => {
		await POST(makeEvent({ method: 'POST' }));
		expect(mockIssue).toHaveBeenCalledWith(42, 7, { title: null, display_name: 'Nils' });
	});

	it('refuses without an active goal', async () => {
		// The app's own `HttpError` — what a Trenara 404 surfaces as, not
		// SvelteKit's `error()`, which throws rather than returning a value to
		// reject with.
		mockGetGoal.mockRejectedValue(new HttpError('No result found', 404));
		await expect(POST(makeEvent({ method: 'POST' }))).rejects.toThrow();
		expect(mockIssue).not.toHaveBeenCalled();
	});

	it('is idempotent: returns the existing link untouched rather than rotating', async () => {
		mockGetForGoal.mockResolvedValue(shareRow);
		const res = await POST(makeEvent({ method: 'POST', body: { title: 'New title' } }));
		const body = await res.json();

		expect(mockIssue).not.toHaveBeenCalled();
		expect(body.token).toBe(shareRow.token);
	});

	it('writes the first snapshot for a freshly created link', async () => {
		await POST(makeEvent({ method: 'POST' }));
		expect(mockRefreshSnapshot).toHaveBeenCalledWith(42, 7, expect.anything());
	});

	it('answers with the share URL built from the request origin', async () => {
		const res = await POST(makeEvent({ method: 'POST' }));
		const body = await res.json();
		expect(body.url).toBe(`https://trainara.example/s/${shareRow.token}`);
	});

	it('is limited per user', async () => {
		mockCheck.mockReturnValue({ allowed: false, retryAfterSeconds: 30 });
		await expect(POST(makeEvent({ method: 'POST' }))).rejects.toThrow();
		expect(mockGetGoal).not.toHaveBeenCalled();
	});
});

describe('PUT /api/v1/goal-share', () => {
	it('requires a session', async () => {
		await expect(PUT(makeEvent({ method: 'PUT', locals: { user: null } }))).rejects.toThrow();
	});

	it('always rotates, even when a live link already exists', async () => {
		mockGetForGoal.mockResolvedValue(shareRow);
		await PUT(makeEvent({ method: 'PUT' }));
		expect(mockIssue).toHaveBeenCalledWith(
			42,
			7,
			expect.objectContaining({ display_name: 'Nils' })
		);
	});

	it('reads the goal id from Trenara, never from the request body', async () => {
		await PUT(makeEvent({ method: 'PUT', body: { goalId: 999 } }));
		expect(mockIssue).toHaveBeenCalledWith(42, 7, expect.anything());
	});

	it('is limited per user', async () => {
		mockCheck.mockReturnValue({ allowed: false, retryAfterSeconds: 30 });
		await expect(PUT(makeEvent({ method: 'PUT' }))).rejects.toThrow();
	});
});

describe('DELETE /api/v1/goal-share', () => {
	it('requires a session', async () => {
		await expect(DELETE(makeEvent({ method: 'DELETE', locals: { user: null } }))).rejects.toThrow();
	});

	it("revokes the link for the runner's current goal", async () => {
		await DELETE(makeEvent({ method: 'DELETE' }));
		expect(mockRevoke).toHaveBeenCalledWith(42, 7);
	});

	it('is idempotent: revoking twice is not an error', async () => {
		mockRevoke.mockResolvedValue({ revoked: false });
		const res = await DELETE(makeEvent({ method: 'DELETE' }));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ revoked: false });
	});

	it('is limited per user', async () => {
		mockCheck.mockReturnValue({ allowed: false, retryAfterSeconds: 30 });
		await expect(DELETE(makeEvent({ method: 'DELETE' }))).rejects.toThrow();
	});
});
