import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { GET } from './+server';

const mockLoadNewsBadge = vi.fn();
vi.mock('$lib/server/news/badge', () => ({
	loadNewsBadge: (...args: unknown[]) => mockLoadNewsBadge(...args)
}));

const cookies = {} as Cookies;

function event(user: { id: number } | null) {
	return { cookies, locals: { user } } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('GET /api/v1/news/badge', () => {
	it('answers with the reader’s badge', async () => {
		mockLoadNewsBadge.mockResolvedValue({ count: 2, capped: false });

		const res = await GET(event({ id: 42 }));

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ badge: { count: 2, capped: false } });
		expect(mockLoadNewsBadge).toHaveBeenCalledWith(cookies, 42);
		expect(res.headers.get('cache-control')).toBe('private, no-store');
	});

	// Trenara or the database unreachable: the loader says so as null, and so
	// does this — a badge nobody can justify is not shown.
	it('passes an unknowable badge on as null rather than failing', async () => {
		mockLoadNewsBadge.mockResolvedValue(null);

		const res = await GET(event({ id: 42 }));

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ badge: null });
	});

	it('refuses a request with no reader behind it', async () => {
		await expect(GET(event(null))).rejects.toMatchObject({ status: 401 });
		expect(mockLoadNewsBadge).not.toHaveBeenCalled();
	});
});
