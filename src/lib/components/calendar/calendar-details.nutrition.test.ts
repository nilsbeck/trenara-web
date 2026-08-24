import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import CalendarDetails from './calendar-details.svelte';
import { createCalendarStore } from '$lib/stores/calendar.svelte';
import type { Schedule } from '$lib/server/trenara/types';

const training = {
	id: 1,
	day: 1787349600,
	day_long: '2026-08-24',
	title: 'Tempo run',
	description: 'A session.',
	show_description_from: 0,
	type: 'training',
	icon_url: '',
	hex_training: '#E69F00',
	hex_completed: null,
	distance: 10,
	blocks: []
};

function schedule(): Schedule {
	return {
		id: 1,
		start_day: 0,
		start_day_long: '2026-08-24',
		training_week: 10,
		type: 'ultimate',
		trainings: [training],
		strength_trainings: [],
		entries: []
	} as unknown as Schedule;
}

function nutritionShape() {
	return {
		id: 1,
		date: '2026-08-24',
		advice: 'Eat well.',
		title: 'Nutrition advice',
		description: 'A training day.',
		plan: [
			{
				type: 'meal',
				order: 1,
				icon: '',
				icon_background_color: '#E69F00',
				title: 'Breakfast',
				percentage: 100,
				values: [{ name: 'Energy', value: 620, order: 1, value_unit: 'kcal' }]
			}
		]
	};
}

const nutrition = nutritionShape();

/*
	The same day as `nutrition`, as the API has actually been seen to send it:
	a null `value_unit`, a meal carrying no values, a percentage that is not a
	number. Rendering used to throw on the first of these, and a tab that throws
	never replaces what it drew last — so the runner kept the spinner for good.
*/
const awkwardNutrition = {
	...nutritionShape(),
	plan: [
		{
			type: 'meal',
			order: 1,
			icon: '',
			icon_background_color: '#E69F00',
			title: 'Breakfast',
			percentage: null,
			values: [
				{ name: 'Energy', value: 620, order: 1, value_unit: null },
				{ name: 'Carbs', value: 80, order: 2, value_unit: 'g' }
			]
		},
		{
			type: 'meal',
			order: 2,
			icon: '',
			icon_background_color: '#56B4E9',
			title: 'Lunch',
			percentage: null,
			values: null
		}
	]
};

type Mode = 'ok' | 'fail' | 'hang' | 'awkward';
let mode: Mode = 'ok';
let nutritionCalls = 0;

function stubFetch() {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init?: RequestInit) => {
			if (url.includes('/api/v1/nutrition')) {
				nutritionCalls++;
				if (mode === 'fail') return new Response('nope', { status: 500 });
				if (mode === 'awkward') {
					return new Response(JSON.stringify(awkwardNutrition), {
						status: 200,
						headers: { 'content-type': 'application/json' }
					});
				}
				if (mode === 'hang') {
					// Never settles on its own — only the caller's abort ends it.
					return new Promise((_, reject) => {
						init?.signal?.addEventListener('abort', () =>
							reject(new DOMException('Aborted', 'AbortError'))
						);
					});
				}
				return new Response(JSON.stringify(nutrition), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				});
			}
			return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
		})
	);
}

function mount() {
	const store = createCalendarStore(new Date('2026-08-24'));
	store.setSchedule(schedule());
	store.setSelectedDate({ year: 2026, month: 7, day: 24 });
	render(CalendarDetails, { context: new Map([['calendar', store]]) });
	return store;
}

const openNutrition = () => fireEvent.click(screen.getByRole('button', { name: 'Nutrition' }));

describe('nutrition tab failure handling', () => {
	beforeEach(() => {
		mode = 'ok';
		nutritionCalls = 0;
		stubFetch();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('still shows the day when the request succeeds', async () => {
		mount();
		await openNutrition();
		await waitFor(() => expect(screen.getByText('Total for the day')).toBeInTheDocument());
	});

	it('gives up on a request that never comes back, instead of loading for ever', async () => {
		vi.useFakeTimers();
		mode = 'hang';
		mount();
		await openNutrition();
		expect(screen.getByText('Loading...')).toBeInTheDocument();

		await vi.advanceTimersByTimeAsync(15_000);
		vi.useRealTimers();

		await waitFor(() => {
			expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
			expect(screen.getByText('Nutrition took too long to load.')).toBeInTheDocument();
		});
	});

	it('reports a failed request rather than calling the day empty', async () => {
		mode = 'fail';
		mount();
		await openNutrition();
		await waitFor(() =>
			expect(screen.getByText('Could not load nutrition for this day.')).toBeInTheDocument()
		);
		expect(screen.queryByText('No nutrition data for this day.')).not.toBeInTheDocument();
	});

	it('retries after a failure, and shows the day once it works', async () => {
		mode = 'fail';
		mount();
		await openNutrition();
		await waitFor(() => expect(screen.getByText('Try again')).toBeInTheDocument());

		mode = 'ok';
		await fireEvent.click(screen.getByText('Try again'));
		await waitFor(() => expect(screen.getByText('Total for the day')).toBeInTheDocument());
		expect(nutritionCalls).toBe(2);
	});

	it('asks again on the next visit to the tab after a failure', async () => {
		mode = 'fail';
		mount();
		await openNutrition();
		await waitFor(() => expect(screen.getByText('Try again')).toBeInTheDocument());

		mode = 'ok';
		await fireEvent.click(screen.getByRole('button', { name: 'Training' }));
		await openNutrition();
		await waitFor(() => expect(screen.getByText('Total for the day')).toBeInTheDocument());
	});

	it('renders a day the API sends with null units and empty meals', async () => {
		mode = 'awkward';
		mount();
		await openNutrition();

		// The point of the test is that this arrives at all: the render used to
		// throw here, leaving the spinner in place with the error only in the
		// console.
		await waitFor(() => expect(screen.getByText('Total for the day')).toBeInTheDocument());
		expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
		expect(screen.getByText('Breakfast')).toBeInTheDocument();

		// The meal the API sent no figures for keeps its name and drops the row
		// of em dashes that stood in for them.
		expect(screen.getByText('Lunch')).toBeInTheDocument();
		expect(screen.queryByText('—')).not.toBeInTheDocument();
	});

	/*
		The advice is derived from the session, so a session that moved underneath
		the tab invalidates it as surely as picking another day does. This is the
		half of the guard a cache test cannot see: without it the tab would go on
		showing the advice for a plan that no longer exists, and nothing else here
		would notice.
	*/
	it('asks again when the plan the advice was for has moved', async () => {
		const store = mount();
		await openNutrition();
		await waitFor(() => expect(screen.getByText('Total for the day')).toBeInTheDocument());
		expect(nutritionCalls).toBe(1);

		store.replaceTraining({ ...training, title: 'Easy run', distance: 8 } as never);

		await waitFor(() => expect(nutritionCalls).toBe(2));
	});

	it('does not refetch a day it already has', async () => {
		mount();
		await openNutrition();
		await waitFor(() => expect(screen.getByText('Total for the day')).toBeInTheDocument());
		await fireEvent.click(screen.getByRole('button', { name: 'Training' }));
		await openNutrition();
		expect(nutritionCalls).toBe(1);
	});
});
