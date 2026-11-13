import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

/**
 * The dashboard has to fit a phone.
 *
 * Both columns are a definite 28rem with `max-w-full`, and `max-w-full` is a
 * percentage of the parent — so it only caps a column whose every wrapper is
 * itself capped. Below `lg` the wrappers are flex items in a column container
 * with `items-center` / `items-start`, which sizes a child to its content:
 * the column's 448px. The cap then resolved against 448px, did nothing, and
 * on a 390px phone the calendar overflowed by 58px — clipped by 29px on each
 * side, Sunday falling off the week.
 *
 * jsdom has no layout, so this cannot measure the overflow. It pins what
 * prevents it instead: from each column up to the page's root, every wrapper
 * carries `max-w-full`.
 */

vi.mock('$app/navigation', () => ({ invalidate: vi.fn() }));

// The children are irrelevant here and expensive to mount; the wrappers are
// the page's own markup.
vi.mock('#lib/components/calendar/calendar.svelte', async () => ({
	default: (await import('#lib/components/shared/stub.fixture.svelte')).default
}));
vi.mock('#lib/components/goal/goal-card.svelte', async () => ({
	default: (await import('#lib/components/shared/stub.fixture.svelte')).default
}));
vi.mock('#lib/components/predictions/predictions-card.svelte', async () => ({
	default: (await import('#lib/components/shared/stub.fixture.svelte')).default
}));

const data = {
	goal: { id: 7, name: 'Valencia 42k' },
	userStats: { best_times: { time_for_goal: '3:03:36', pace_for_goal: '4:22' } },
	history: { records: [], error: null },
	share: null,
	schedule: null
};

afterEach(() => cleanup());

/** Every element from `from` (exclusive) up to `root` (exclusive). */
function wrappersBetween(from: Element, root: Element): Element[] {
	const out: Element[] = [];
	for (let el = from.parentElement; el && el !== root; el = el.parentElement) out.push(el);
	return out;
}

describe('dashboard layout on a phone', () => {
	it('caps every wrapper around both columns at the screen width', () => {
		const { container } = render(Page, { data } as never);
		const root = container.firstElementChild!;
		const stubs = screen.getAllByTestId('stub');
		// goal card, predictions card, calendar
		expect(stubs).toHaveLength(3);

		let checked = 0;
		for (const stub of stubs) {
			for (const wrapper of wrappersBetween(stub, root)) {
				// Only a child of a column flex container that aligns its items
				// to the start or centre is sized by its content — the case that
				// overflowed. A block or grid child takes its parent's width.
				const parent = wrapper.parentElement!.classList;
				const contentSized =
					parent.contains('flex-col') &&
					(parent.contains('items-center') || parent.contains('items-start'));
				if (!contentSized) continue;

				checked++;
				const cls = wrapper.getAttribute('class') ?? '';
				expect(cls, `wrapper "${cls}" lets its column overflow a phone`).toMatch(/\bmax-w-full\b/);
			}
		}
		// The two column wrappers and the pair's wrapper, reached from both
		// directions — proof the walk found the wrappers at all.
		expect(checked).toBeGreaterThanOrEqual(3);
	});
});
