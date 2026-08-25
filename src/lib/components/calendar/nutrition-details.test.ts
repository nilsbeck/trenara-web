import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import NutritionDetails from './nutrition-details.svelte';
import type { AppConfig, NutritionAdvice } from '$lib/server/trenara/types';
import { appConfig } from '$lib/stores/app-config.svelte';

const DISCLAIMER = 'Before you start using the nutritional coach, read this.';

/** Only the branch this tab reads; the rest of the config is another screen's. */
function servedConfig(disclaimer: string): AppConfig {
	return { nutritional: { disclaimer } } as AppConfig;
}

function advice(overrides: Partial<NutritionAdvice> = {}): NutritionAdvice {
	return {
		id: 1,
		date: '2026-08-24',
		advice: 'Front-load your carbohydrates before this evening’s tempo run.',
		title: 'Nutrition advice',
		description: 'A training day with a hard session.',
		plan: [
			{
				type: 'meal',
				order: 2,
				icon: '',
				icon_background_color: '#56B4E9',
				title: 'Lunch',
				percentage: 40,
				values: [
					{ name: 'Energy', value: 744, order: 1, value_unit: 'kcal' },
					{ name: 'Carbs', value: 95, order: 2, value_unit: 'g' },
					{ name: 'Protein', value: 35, order: 3, value_unit: 'g' }
				]
			},
			{
				type: 'meal',
				order: 1,
				icon: '',
				icon_background_color: '#E69F00',
				title: 'Breakfast',
				percentage: 60,
				values: [
					{ name: 'Energy', value: 1116, order: 1, value_unit: 'kcal' },
					{ name: 'Carbs', value: 145, order: 2, value_unit: 'g' }
				]
			}
		],
		...overrides
	};
}

function renderTab(data: NutritionAdvice | null, isLoading = false) {
	return render(NutritionDetails, {
		props: {
			selectedDate: '2026-08-24',
			nutritionDate: 'Monday 24 August',
			nutritionData: data,
			isLoading
		}
	});
}

describe('NutritionDetails', () => {
	// The store is module-level, so a config set in one test outlives it.
	afterEach(() => appConfig.set(null));

	it('leads with the day’s total energy', () => {
		renderTab(advice());
		const total = screen.getByText('Total for the day').closest('div')!;
		expect(within(total).getByText('1,860')).toBeInTheDocument();
		expect(within(total).getByText('kcal')).toBeInTheDocument();
	});

	it('sums the other macros into the total panel', () => {
		renderTab(advice());
		const total = screen.getByText('Total for the day').closest('div')!;
		// Carbs across the two meals; protein only exists on one of them.
		expect(within(total).getByText('240')).toBeInTheDocument();
		expect(within(total).getByText('35')).toBeInTheDocument();
	});

	it('puts the total above the breakdown', () => {
		const { container } = renderTab(advice());
		const order = [...container.querySelectorAll('h4')].map((h) => h.textContent?.trim());
		expect(order).toEqual(['Total for the day', 'Meal breakdown']);
	});

	it('breaks the day down in the order the meals are eaten', () => {
		renderTab(advice());
		const meals = screen.getAllByText(/^(Breakfast|Lunch)$/).map((el) => el.textContent);
		expect(meals).toEqual(['Breakfast', 'Lunch']);
	});

	it('holds the place of a macro a meal does not carry', () => {
		renderTab(advice());
		const breakfast = screen.getByText('Breakfast').closest('div')!.parentElement!;
		expect(within(breakfast).getByText('—')).toBeInTheDocument();
	});

	it('shows each meal’s share of the day', () => {
		renderTab(advice());
		expect(screen.getByText('60% of day')).toBeInTheDocument();
		expect(screen.getByText('40% of day')).toBeInTheDocument();
	});

	it('names each total by the quantity it measures', () => {
		renderTab(
			advice({
				plan: [
					{
						type: 'meal',
						order: 1,
						icon: '',
						icon_background_color: '#e11d48',
						title: 'Breakfast',
						percentage: 100,
						values: [
							{ name: 'Kcal', value: 729, order: 1, value_unit: null },
							{ name: 'Carbs', value: 119, order: 2, value_unit: 'gr' }
						]
					}
				]
			} as unknown as Partial<NutritionAdvice>)
		);
		// The API names the energy column for its unit and sends no `value_unit`,
		// so the row's own label is what says what 729 is.
		const total = screen.getByText('Total for the day').closest('div')!;
		expect(within(total).getByText('729')).toBeInTheDocument();
		expect(within(total).getAllByText('Kcal').length).toBeGreaterThan(0);
		expect(within(total).getByText('119')).toBeInTheDocument();
		expect(within(total).getAllByText('gr').length).toBeGreaterThan(0);
	});

	it('puts the standing preamble after the numbers, not before them', () => {
		const { container } = renderTab(advice());
		const text = container.textContent ?? '';
		expect(text.indexOf('Total for the day')).toBeLessThan(
			text.indexOf('A training day with a hard session.')
		);
	});

	it('keeps the coach’s note', () => {
		renderTab(advice());
		expect(screen.getByText(/Front-load your carbohydrates/)).toBeInTheDocument();
	});

	it('renders a day with no meal plan without the totals or breakdown', () => {
		renderTab(advice({ plan: [] }));
		expect(screen.queryByText('Total for the day')).not.toBeInTheDocument();
		expect(screen.queryByText('Meal breakdown')).not.toBeInTheDocument();
		expect(screen.getByText('A training day with a hard session.')).toBeInTheDocument();
	});

	it('says when there is nothing for the day', () => {
		renderTab(null);
		expect(screen.getByText('No nutrition data for this day.')).toBeInTheDocument();
	});

	it('carries the served disclaimer, after the coach’s note', () => {
		appConfig.set(servedConfig(DISCLAIMER));
		const { container } = renderTab(advice());
		const text = container.textContent ?? '';
		expect(container.querySelector('p.border-t')?.textContent?.trim()).toBe(DISCLAIMER);
		expect(text.indexOf('Front-load your carbohydrates')).toBeLessThan(text.indexOf(DISCLAIMER));
	});

	// The config request is streamed and can fail; the day's numbers do not wait
	// on it, and nothing about the disclaimer is written down here to fall back
	// to — a paragraph of ours in its place would be the thing this avoids.
	it('renders the day without a disclaimer when the config never arrived', () => {
		const { container } = renderTab(advice());
		expect(container.textContent).toContain('Total for the day');
		expect(container.textContent).not.toContain(DISCLAIMER);
	});

	it('leaves out a disclaimer served empty', () => {
		appConfig.set(servedConfig('   '));
		const { container } = renderTab(advice());
		expect(container.querySelector('p.border-t')).toBeNull();
	});

	it('shows a loading state', () => {
		renderTab(advice(), true);
		expect(screen.getByText('Loading...')).toBeInTheDocument();
	});
});
