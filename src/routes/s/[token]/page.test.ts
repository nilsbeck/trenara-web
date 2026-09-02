import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/svelte';
import SharePage from './+page.svelte';

beforeAll(() => {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

afterEach(() => cleanup());

const goal = {
	name: 'Berlin Marathon',
	start_date: '2026-01-06',
	end_date: '2099-01-01',
	distance: '42.195 km',
	distance_unit: 'km',
	distance_value: 42.195,
	time: '3:30:00',
	time_in_sec: 12600,
	pace: '5:00 min/km'
};

const userStats = {
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
};

function mount(data: Record<string, unknown>) {
	render(SharePage, { props: { data } as never });
}

describe('the shared goal page', () => {
	it('renders the goal card for a live, snapshotted link', () => {
		mount({
			title: null,
			name: 'Nils',
			snapshotAt: '2026-08-01T00:00:00Z',
			goal,
			userStats,
			history: { records: [], error: null }
		});

		expect(screen.getByRole('heading', { level: 1, name: /berlin marathon/i })).toBeTruthy();
		expect(screen.getByText(/updated/i)).toBeTruthy();
	});

	it('prefers the runner-given title over the goal name', () => {
		mount({
			title: 'Follow me to Berlin!',
			name: 'Nils',
			snapshotAt: '2026-08-01T00:00:00Z',
			goal,
			userStats,
			history: { records: [], error: null }
		});

		expect(screen.getByRole('heading', { level: 1, name: /follow me to berlin/i })).toBeTruthy();
	});

	it('shows the waiting state rather than a card when there is no snapshot yet', () => {
		mount({
			title: null,
			name: 'Nils',
			snapshotAt: null,
			goal: null,
			userStats: null,
			history: { records: [], error: null }
		});

		expect(screen.getByText(/not updated yet/i)).toBeTruthy();
		expect(screen.queryByRole('heading', { level: 2, name: /berlin marathon/i })).toBeNull();
	});

	it('carries the unofficial-client disclaimer', () => {
		mount({
			title: null,
			name: null,
			snapshotAt: null,
			goal: null,
			userStats: null,
			history: { records: [], error: null }
		});

		expect(screen.getByText(/unofficial, unaffiliated third-party client/i)).toBeTruthy();
	});
});
