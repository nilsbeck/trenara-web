import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen, within, fireEvent } from '@testing-library/svelte';
import { flushSync, tick } from 'svelte';
import OfflinePage from './+page.svelte';
import { OFFLINE_CARDS_KEY, OFFLINE_PLAN_KEY, type OfflinePlan } from '#lib/utils/offline-plan.js';

// The cards are the dashboard's own and tested there; here it matters that
// they are drawn from the kept copy, beside the calendar.
vi.mock('#lib/components/goal/goal-card.svelte', async () => ({
	default: (await import('#lib/components/shared/stub.fixture.svelte')).default
}));
vi.mock('#lib/components/predictions/predictions-card.svelte', async () => ({
	default: (await import('#lib/components/shared/stub.fixture.svelte')).default
}));
import type {
	Entry,
	Schedule,
	ScheduledTraining,
	StrengthTraining
} from '#lib/server/trenara/types.js';

/**
 * The saved plan, drawn in the dashboard's calendar under one line saying it
 * is not live — and nothing on it that could change the plan.
 */

// Wednesday 25 November 2026, 09:00 in Berlin, where the suite runs.
const NOW = new Date(2026, 10, 25, 9, 0);
// Read the evening before.
const SAVED_AT = new Date(2026, 10, 24, 18, 42).getTime();

function training(id: number, day: string, title: string, extra = {}): ScheduledTraining {
	return {
		id,
		day_long: day,
		title,
		description: 'Stay controlled on the reps.',
		hex_training: '#ff8800',
		// Every capability the coach can grant, granted: none of it may surface.
		can_be_edited: true,
		can_cross_train: true,
		can_toggle_cooldown: true,
		has_cooldown: true,
		can_change_distance: true,
		can_change_intensity: true,
		training: {
			total_distance: '10.2 km',
			total_time: '55:00',
			blocks: [
				{ order: 1, type: 'warmup', text: '15 min warm-up' },
				{
					order: 2,
					type: 'core',
					text: 'Reps',
					repeat: 5,
					blocks: [{ order: 1, type: 'run', text: '4 min at threshold' }]
				},
				{ order: 3, type: 'cooldown', text: '10 min cool-down' }
			]
		},
		...extra
	} as unknown as ScheduledTraining;
}

function schedule(parts: Partial<Schedule>): Schedule {
	return {
		id: 1,
		start_day: 0,
		start_day_long: '2026-10-26',
		training_week: 44,
		type: 'ultimate',
		trainings: [],
		strength_trainings: [],
		entries: [],
		...parts
	};
}

const plan: OfflinePlan = {
	version: 2,
	savedAt: SAVED_AT,
	months: [
		{
			month: '2026-11',
			schedule: schedule({
				trainings: [
					training(1, '2026-11-25', 'Threshold intervals'),
					training(2, '2026-11-27', 'Long run')
				],
				strength_trainings: [
					{
						id: 7,
						day: '2026-11-26',
						title: 'Core circuit',
						description: '',
						exercises: [],
						rest_between_sets: 30,
						rest_between_exercises: 60
					} as unknown as StrengthTraining
				],
				entries: [
					{
						id: 9,
						type: 'run',
						name: 'Easy run',
						start_time: '2026-11-23T07:00:00+01:00',
						distance: '6.1 km',
						time: '34:12',
						rpe: 4
					} as unknown as Entry
				]
			})
		},
		{
			month: '2026-12',
			schedule: schedule({ trainings: [training(3, '2026-12-02', 'Hill repeats')] })
		}
	]
};

function setOnline(value: boolean) {
	Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOW);
	localStorage.clear();
	setOnline(false);
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe('the offline page with a saved plan', () => {
	beforeEach(() => {
		localStorage.setItem(OFFLINE_PLAN_KEY, JSON.stringify(plan));
		render(OfflinePage);
	});

	it('says, in one line, that it is offline and when the plan was saved', () => {
		const banner = screen.getByTestId('offline-banner');

		expect(banner.textContent!.replace(/\s+/g, ' ').trim()).toBe(
			'Offline · Data from Tue, Nov 24, 6:42 PM Retry'
		);
	});

	it('draws the calendar on this month, opened on today', () => {
		expect(screen.getByText('November 2026')).toBeTruthy();
		expect(screen.getByText('Threshold intervals')).toBeTruthy();
		expect(screen.getByText('Stay controlled on the reps.')).toBeTruthy();
		expect(screen.getByText('4 min at threshold')).toBeTruthy();
	});

	it('shows another day when it is picked', async () => {
		await fireEvent.click(screen.getByRole('button', { name: 'Select day 27' }));

		expect(screen.getByText('Long run')).toBeTruthy();
	});

	it('shows a day that was run, with what was run', async () => {
		await fireEvent.click(screen.getByRole('button', { name: 'Select day 23' }));

		expect(screen.getByText('Easy run')).toBeTruthy();
		expect(screen.getByText('34:12')).toBeTruthy();
	});

	it('opens a strength-only day on its strength session', async () => {
		await fireEvent.click(screen.getByRole('button', { name: 'Select day 26' }));

		expect(screen.getByText('Core circuit')).toBeTruthy();
	});

	it('pages to the next month it kept', async () => {
		await fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
		await tick();

		expect(screen.getByText('December 2026')).toBeTruthy();
		expect(screen.queryByTestId('offline-month-missing')).toBeNull();
	});

	it('says a month it did not keep is not saved, rather than showing it as empty', async () => {
		await fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
		await tick();

		expect(screen.getByText('October 2026')).toBeTruthy();
		expect(screen.getByTestId('offline-month-missing')).toBeTruthy();
	});

	it('has nothing on it that acts on the plan', () => {
		const actions =
			/refresh|delete|change|move|rate|feedback|treadmill|cool-down|add|remove|setup|swap/i;
		const named = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? '');
		expect(named.filter((name) => actions.test(name))).toEqual([]);
		expect(screen.queryByRole('checkbox')).toBeNull();
		expect(screen.queryByRole('switch')).toBeNull();
		expect(document.querySelectorAll('form, input, select, textarea')).toHaveLength(0);
		// The one link goes back to the live dashboard, by a full page load.
		const links = screen.getAllByRole('link');
		expect(links.map((a) => a.getAttribute('href'))).toEqual(['/dashboard']);
		expect(links[0].hasAttribute('data-sveltekit-reload')).toBe(true);
	});

	it('is no longer looking once it has read the plan', () => {
		expect(screen.queryByTestId('offline-plan-loading')).toBeNull();
	});

	it('says so when the connection comes back', () => {
		setOnline(true);
		window.dispatchEvent(new Event('online'));
		flushSync();

		const banner = screen.getByTestId('offline-banner');
		expect(within(banner).getByText('Back online')).toBeTruthy();
		expect(within(banner).getByRole('link', { name: 'Reload' })).toBeTruthy();
	});
});

describe('the offline page without a saved plan', () => {
	it('says nothing was saved, and stops looking', () => {
		render(OfflinePage);

		expect(screen.getByText(/none was saved on this device/)).toBeTruthy();
		expect(screen.getByTestId('offline-banner').textContent).toContain('no saved plan');
		expect(screen.queryByTestId('offline-plan-loading')).toBeNull();
	});

	it('treats a plan it cannot read as no plan', () => {
		localStorage.setItem(OFFLINE_PLAN_KEY, '{"version":2,"savedAt":"yesterday"}');
		render(OfflinePage);

		expect(screen.getByText(/none was saved on this device/)).toBeTruthy();
		expect(screen.queryByTestId('offline-plan-loading')).toBeNull();
	});
});

describe('the offline page reached with the network up', () => {
	// Trenara down, or a dead spot that still shows bars: "offline" would send
	// the runner to check a connection that is working.
	it('does not claim the device is offline', () => {
		setOnline(true);
		localStorage.setItem(OFFLINE_PLAN_KEY, JSON.stringify(plan));
		render(OfflinePage);

		const banner = screen.getByTestId('offline-banner');
		expect(within(banner).queryByText('Offline')).toBeNull();
		expect(within(banner).getByText('Not connected')).toBeTruthy();
	});
});

describe('the offline page with the goal card kept too', () => {
	const cards = {
		version: 1,
		// Read before the plan was: the line has to give the older of the two.
		savedAt: new Date(2026, 10, 24, 18, 30).getTime(),
		goal: { id: 7, name: 'Valencia 42k' },
		userStats: { best_times: { time_for_goal: '3:03:36' } },
		history: []
	};

	beforeEach(() => {
		localStorage.setItem(OFFLINE_PLAN_KEY, JSON.stringify(plan));
		localStorage.setItem(OFFLINE_CARDS_KEY, JSON.stringify(cards));
		render(OfflinePage);
	});

	it('draws the goal card and the predictions beside the calendar', () => {
		// The goal card and the predictions card.
		expect(screen.getAllByTestId('stub')).toHaveLength(2);
		expect(screen.getByText('November 2026')).toBeTruthy();
		expect(screen.queryByText('Some data could not be loaded')).toBeNull();
	});

	/**
	 * The page fits a phone. The dashboard's columns cap themselves at the
	 * width of what holds them (`max-w-full`), which only works when what holds
	 * them is not sizing them to their content. A centring flex row did: on a
	 * phone the cards ran off the left edge. jsdom has no layout, so this pins
	 * the cause — no content-sizing parent above a wrapper without a cap.
	 */
	it('fits a phone: nothing above the columns sizes them to their content', () => {
		for (const stub of screen.getAllByTestId('stub')) {
			for (let el = stub.parentElement; el && el !== document.body; el = el.parentElement) {
				const parent = el.parentElement?.classList;
				if (!parent) continue;
				const row = parent.contains('flex') && !parent.contains('flex-col');
				const sizesToContent =
					(row && parent.contains('justify-center')) ||
					(parent.contains('flex-col') &&
						(parent.contains('items-center') || parent.contains('items-start')));
				if (!sizesToContent) continue;
				expect(el.getAttribute('class') ?? '', 'a wrapper lets the columns overflow').toMatch(
					/\bmax-w-full\b/
				);
			}
		}
	});

	it('dates the page by the older of the two copies', () => {
		expect(screen.getByTestId('offline-saved-at').textContent).toBe('Tue, Nov 24, 6:30 PM');
	});
});

describe('the offline page with only the plan kept', () => {
	it('draws the calendar alone, not a column saying something failed', () => {
		localStorage.setItem(OFFLINE_PLAN_KEY, JSON.stringify(plan));
		render(OfflinePage);

		expect(screen.queryAllByTestId('stub')).toHaveLength(0);
		expect(screen.queryByText('Some data could not be loaded')).toBeNull();
		expect(screen.getByText('November 2026')).toBeTruthy();
	});
});
