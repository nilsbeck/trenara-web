import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/svelte';
import type { Goal, UserStats } from '$lib/server/trenara/types';
import GoalPage from './+page.svelte';

/**
 * What the goal page says when there is no goal.
 *
 * Deleting the goal in Trenara makes `/api/goal` answer "No result found" — on
 * a 404 or a 400, depending on the capture — and the page used to relay that
 * wording into its error branch: a line of red copied from an API the runner
 * never sees, under a "Try again" button whose only possible outcome was the
 * same refusal. These pin the empty state that replaced it, and that the
 * predictions — which are fitness estimates and owe nothing to a goal — still
 * render beside it.
 */

vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }));

beforeEach(() => {
	// The predictions card renders a slider, not a chart, but the page is
	// mounted whole; nothing here observes a resize.
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

afterEach(() => cleanup());

const userStats = {
	best_times: {
		time_for_5: '00:21:00',
		pace_for_5: '4:12 min/km',
		time_for_10: '00:44:00',
		pace_for_10: '4:24 min/km',
		time_for_half_marathon: '01:37:00',
		pace_for_half_marathon: '4:36 min/km',
		time_for_marathon: '03:25:00',
		pace_for_marathon: '4:51 min/km'
	}
} as unknown as UserStats;

/** One run of the load, as the page receives it: both halves are streamed. */
function mount(goal: Goal | null, stats: UserStats | null = userStats) {
	render(GoalPage, {
		props: {
			data: {
				goal: Promise.resolve(goal),
				userStats: Promise.resolve(stats)
			} as never
		}
	});
}

describe('the goal page with no goal', () => {
	it('says there is no goal instead of repeating the upstream wording', async () => {
		mount(null);

		expect(await screen.findByText(/no goal set/i)).toBeTruthy();
		expect(screen.queryByText(/no result found/i)).toBeNull();
	});

	it('does not offer a retry for something that is not a failure', async () => {
		mount(null);
		await screen.findByText(/no goal set/i);

		expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
	});

	it('points at the archive, which is where the goals that did exist are', async () => {
		mount(null);

		const link = await screen.findByRole('link', { name: /goal history/i });
		expect(link.getAttribute('href')).toBe('/goal/history');
	});

	// The predictions are a fitness estimate. They were readable before the goal
	// was deleted and they are readable after it.
	it('still shows the predictions', async () => {
		mount(null);

		expect(await screen.findByText('03:25:00')).toBeTruthy();
	});

	it('falls back to the plain line when the stats are missing too', async () => {
		mount(null, null);

		expect(await screen.findByText(/no goal or stats data available/i)).toBeTruthy();
		expect(screen.queryByText(/no goal set/i)).toBeNull();
	});
});
