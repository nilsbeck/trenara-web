import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import GoalCard from './goal-card.svelte';
import type { Goal, UserStats } from '$lib/server/trenara/types';

// The card mounts a chart, and jsdom lays nothing out. Only the fold is under
// test here.
beforeAll(() => {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

afterEach(() => {
	cleanup();
});

const goal = {
	id: 1,
	name: 'Autumn Marathon',
	start_date: '2026-01-01',
	end_date: '2099-01-01',
	distance: '42.2 km',
	distance_value: 42.2,
	pace: '5:00 min/km',
	time: '03:30:00',
	time_in_sec: 12600
} as unknown as Goal;

const userStats = {
	best_times: {
		time_for_goal: '03:35:00',
		pace_for_goal: '5:06 min/km',
		time_for_10: '00:45:00',
		pace_for_10: '4:30 min/km'
	}
} as unknown as UserStats;

function mount(props: Record<string, unknown> = {}) {
	render(GoalCard, { props: { goal, userStats, history: [], ...props } });
}

/** The fold's own control — the graph picker's arrows are buttons too. */
function toggle() {
	return screen.getByRole('button', { name: /goal details/i });
}

/** A stand-in for `headerExtra`, recording whether it was actually clicked. */
function shareSnippet(onClick: () => void) {
	return createRawSnippet(() => ({
		render: () => '<button type="button" data-testid="fake-share">Share</button>',
		setup: (node) => {
			node.addEventListener('click', onClick);
		}
	}));
}

describe('goal card, folded', () => {
	it('is not foldable unless asked — the /goal page has nothing to fold away from', () => {
		mount();
		expect(screen.queryByRole('button', { name: /goal details/i })).toBeNull();
	});

	it('offers the fold when asked, closed, and pointed at the body', () => {
		mount({ collapsible: true, expanded: false, bodyId: 'goal-card-body' });
		expect(toggle().getAttribute('aria-expanded')).toBe('false');
		expect(toggle().getAttribute('aria-controls')).toBe('goal-card-body');
		expect(document.getElementById('goal-card-body')).not.toBeNull();
	});

	it('reads as open when it is open, and offers to hide rather than show', () => {
		mount({ collapsible: true, expanded: true });
		expect(toggle().getAttribute('aria-expanded')).toBe('true');
		expect(toggle().textContent).toMatch(/hide/i);
	});

	it('reports a press without deciding for itself — the page owns the state', async () => {
		const pressed: number[] = [];
		mount({ collapsible: true, expanded: false, ontoggle: () => pressed.push(1) });
		await fireEvent.click(toggle());
		expect(pressed).toHaveLength(1);
		// Still closed: nothing moved but the page's own state.
		expect(toggle().getAttribute('aria-expanded')).toBe('false');
	});

	it('keeps the head — and so the control — on show while the body is folded', () => {
		mount({ collapsible: true, expanded: false });
		expect(screen.getByRole('heading', { name: 'Autumn Marathon' })).toBeTruthy();
		expect(toggle()).toBeTruthy();
	});

	it('carries the prediction in the head, labelled, for the closed card to show', () => {
		mount({ collapsible: true, expanded: false });
		// The body's table states the same prediction, so this reads the head's
		// own block rather than the document: finding the time twice is correct.
		const head = screen.getByText('Predicted time').closest('.border-t') as HTMLElement;
		expect(within(head).getByText('03:35:00')).toBeTruthy();
		expect(within(head).getByText('5:06 /km')).toBeTruthy();
		expect(within(head).getByText('Predicted pace')).toBeTruthy();
		// Shortened here and left alone in the table below.
		expect(screen.getByText('5:06 min/km')).toBeTruthy();
	});

	it('folds the body shut and open with the same class pair', () => {
		mount({ collapsible: true, expanded: false, bodyId: 'b' });
		const shut = document.getElementById('b')!.className;
		expect(shut).toContain('grid-rows-[0fr]');
		expect(shut).toContain('invisible');
		// `lg` always puts the body back, whatever the fold says — and `lg`
		// rather than `sm`, because that is where the cards move beside the
		// calendar. Below it they are stacked, and a stacked card folds.
		expect(shut).toContain('lg:grid-rows-[1fr]');
		expect(shut).toContain('lg:visible');
		expect(shut).not.toContain('sm:');

		cleanup();
		mount({ collapsible: true, expanded: true, bodyId: 'b' });
		expect(document.getElementById('b')!.className).toContain('grid-rows-[1fr]');
	});

	it('leaves the body unwrapped when it cannot fold, so /goal keeps a plain card', () => {
		mount({ bodyId: 'b' });
		expect(document.getElementById('b')!.className).toBe('');
	});

	it('folds a completed goal too, or its card could never be opened', () => {
		mount({ goal: { ...goal, end_date: '2020-01-01' }, collapsible: true, expanded: false });
		expect(screen.getByRole('heading', { name: /goal completed/i })).toBeTruthy();
		expect(toggle().getAttribute('aria-expanded')).toBe('false');
	});

	// The toggle is an invisible `-inset-2` button laid over the whole head so
	// the head is one big tap target — which also made it, being the only
	// *positioned* element there, paint on top of everything else in the row
	// regardless of DOM order. A control passed as `headerExtra` (the share
	// button) sat under it and never received a click.
	//
	// jsdom has no layout engine, so it cannot be asked "which element is
	// visually on top here" the way a real browser can — `fireEvent.click` on
	// a specific node dispatches straight to it no matter what CSS says, which
	// means a test that fires the click and checks who handled it passes
	// whether or not the stacking is actually fixed. What can be checked here
	// is the CSS that decides the outcome in a real browser: the toggle pinned
	// to the base stacking layer, and headerExtra's wrapper lifted above it.
	it('gives the fold toggle a plain z-index rather than an implicit stacking order', () => {
		mount({ collapsible: true, expanded: false });
		expect(toggle().className).toContain('z-0');
	});

	it("wraps headerExtra in a layer above the toggle's, so it can still be clicked", () => {
		const shared: number[] = [];
		mount({
			collapsible: true,
			expanded: false,
			headerExtra: shareSnippet(() => shared.push(1))
		});

		const wrapper = screen.getByTestId('fake-share').parentElement!;
		expect(wrapper.className).toContain('relative');
		expect(wrapper.className).toContain('z-10');
	});

	it('does the same on a completed goal, whose head renders on a separate branch', () => {
		const shared: number[] = [];
		mount({
			goal: { ...goal, end_date: '2020-01-01' },
			collapsible: true,
			expanded: false,
			headerExtra: shareSnippet(() => shared.push(1))
		});

		const wrapper = screen.getByTestId('fake-share').parentElement!;
		expect(wrapper.className).toContain('relative');
		expect(wrapper.className).toContain('z-10');
	});

	// A tap to expand the card used to leave the whole head ringed in the
	// accent colour until something else took focus — `:focus` does not
	// distinguish a pointer press from a keyboard tab. `:focus-visible` does.
	it('rings the fold toggle only for keyboard focus, not for the tap that fires it', () => {
		mount({ collapsible: true, expanded: false });
		const cls = toggle().className;
		expect(cls).toContain('focus-visible:ring-2');
		expect(cls).not.toContain('focus:ring-2');
	});
});
