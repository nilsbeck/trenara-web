import { describe, it, expect } from 'vitest';
import {
	type NutritionMeal,
	dailyTotals,
	energyAmount,
	formatAmount,
	macroAmounts,
	macroColumns,
	mealAmount,
	mealShares,
	orderedMeals
} from './nutrition';

function meal(
	title: string,
	order: number,
	percentage: number,
	values: Array<[string, number, string]>
): NutritionMeal {
	return {
		type: 'meal',
		order,
		icon: 'https://example.test/icon.svg',
		icon_background_color: '#E69F00',
		title,
		percentage,
		values: values.map(([name, value, value_unit], index) => ({
			name,
			value,
			order: index + 1,
			value_unit
		}))
	};
}

/** A day the API answers in full: four meals, four macros each, shares in percent. */
function fullDay(): NutritionMeal[] {
	return [
		meal('Breakfast', 1, 25, [
			['Energy', 620, 'kcal'],
			['Carbs', 80, 'g'],
			['Protein', 25, 'g'],
			['Fat', 20, 'g']
		]),
		meal('Lunch', 2, 30, [
			['Energy', 744, 'kcal'],
			['Carbs', 95, 'g'],
			['Protein', 35, 'g'],
			['Fat', 24, 'g']
		]),
		meal('Snack', 3, 15, [
			['Energy', 372, 'kcal'],
			['Carbs', 55, 'g']
		]),
		meal('Dinner', 4, 30, [
			['Energy', 744, 'kcal'],
			['Carbs', 90, 'g'],
			['Protein', 40, 'g'],
			['Fat', 26, 'g']
		])
	];
}

describe('orderedMeals', () => {
	it('sorts meals into the order they are eaten', () => {
		const scrambled = [fullDay()[3], fullDay()[0], fullDay()[2], fullDay()[1]];
		expect(orderedMeals(scrambled).map((m) => m.title)).toEqual([
			'Breakfast',
			'Lunch',
			'Snack',
			'Dinner'
		]);
	});

	it('leaves the source array alone', () => {
		const meals = fullDay();
		orderedMeals(meals);
		expect(meals[0].title).toBe('Breakfast');
	});

	it('handles a missing plan', () => {
		expect(orderedMeals(null)).toEqual([]);
		expect(orderedMeals(undefined)).toEqual([]);
	});
});

describe('macroColumns', () => {
	it('is the union of the macros across the day, in order', () => {
		expect(macroColumns(fullDay()).map((c) => c.name)).toEqual([
			'Energy',
			'Carbs',
			'Protein',
			'Fat'
		]);
	});

	it('carries the unit of each macro', () => {
		expect(macroColumns(fullDay()).map((c) => c.unit)).toEqual(['kcal', 'g', 'g', 'g']);
	});

	it('keeps the lowest order when meals disagree', () => {
		const meals = [
			meal('Breakfast', 1, 50, [
				['Energy', 600, 'kcal'],
				['Carbs', 80, 'g']
			]),
			meal('Dinner', 2, 50, [
				['Carbs', 90, 'g'],
				['Energy', 600, 'kcal']
			])
		];
		expect(macroColumns(meals).map((c) => c.name)).toEqual(['Energy', 'Carbs']);
	});

	it('handles an empty plan', () => {
		expect(macroColumns([])).toEqual([]);
	});
});

describe('mealAmount', () => {
	it('reads a meal value by column', () => {
		const [breakfast] = fullDay();
		const [energy] = macroColumns(fullDay());
		expect(mealAmount(breakfast, energy)).toBe(620);
	});

	it('is null where the meal does not carry the macro', () => {
		const snack = fullDay()[2];
		const protein = macroColumns(fullDay()).find((c) => c.name === 'Protein')!;
		expect(mealAmount(snack, protein)).toBeNull();
	});
});

describe('dailyTotals', () => {
	it('sums each macro across the day', () => {
		expect(dailyTotals(fullDay()).map((t) => [t.name, t.value])).toEqual([
			['Energy', 2480],
			['Carbs', 320],
			['Protein', 100],
			['Fat', 70]
		]);
	});

	it('treats a macro a meal skips as zero rather than dropping the day', () => {
		const protein = dailyTotals(fullDay()).find((t) => t.name === 'Protein');
		expect(protein?.value).toBe(100);
	});

	it('handles an empty plan', () => {
		expect(dailyTotals([])).toEqual([]);
	});
});

describe('energyAmount', () => {
	it('picks the calorie column whatever it is called', () => {
		const totals = dailyTotals([
			meal('Ontbijt', 1, 100, [
				['Koolhydraten', 80, 'g'],
				['Energie', 620, 'kcal']
			])
		]);
		expect(energyAmount(totals)?.name).toBe('Energie');
	});

	it('falls back to the first column when no unit looks like energy', () => {
		const totals = dailyTotals([meal('Snack', 1, 100, [['Carbs', 80, 'g']])]);
		expect(energyAmount(totals)?.name).toBe('Carbs');
	});

	it('is null for a day with no macros at all', () => {
		expect(energyAmount([])).toBeNull();
	});
});

describe('macroAmounts', () => {
	it('is everything but the headline energy figure', () => {
		const totals = dailyTotals(fullDay());
		expect(macroAmounts(totals).map((t) => t.name)).toEqual(['Carbs', 'Protein', 'Fat']);
	});
});

describe('mealShares', () => {
	it('uses the API percentages when they add up to a day', () => {
		expect(mealShares(fullDay())).toEqual([25, 30, 15, 30]);
	});

	it('scales fractions up to percentages', () => {
		const meals = fullDay().map((m, i) => ({ ...m, percentage: [0.25, 0.3, 0.15, 0.3][i] }));
		expect(mealShares(meals)).toEqual([25, 30, 15, 30]);
	});

	it('computes the share from energy when the percentages are missing', () => {
		const meals = fullDay().map((m) => ({ ...m, percentage: 0 }));
		expect(mealShares(meals).map((s) => Math.round(s))).toEqual([25, 30, 15, 30]);
	});

	it('computes the share from energy when the percentages do not add up', () => {
		const meals = fullDay().map((m) => ({ ...m, percentage: 400 }));
		expect(mealShares(meals).map((s) => Math.round(s))).toEqual([25, 30, 15, 30]);
	});

	it('does not divide by zero on a day with no energy', () => {
		const meals = [meal('Water', 1, 0, [['Energy', 0, 'kcal']])];
		expect(mealShares(meals)).toEqual([0]);
	});

	it('handles an empty plan', () => {
		expect(mealShares([])).toEqual([]);
	});
});

/*
	The plan is API data, and its type is a promise about shape that the wire
	does not keep. A tab that throws while rendering never replaces what it drew
	last, so anything unhandled here leaves a runner on "Loading..." for good —
	which is exactly what one null `value_unit` used to do.
*/
describe('malformed API payloads', () => {
	const oddMeal = (values: unknown): NutritionMeal =>
		({
			type: 'meal',
			order: 1,
			icon: '',
			icon_background_color: '#E69F00',
			title: 'Breakfast',
			percentage: 100,
			values
		}) as NutritionMeal;

	it('reads a value whose unit is null', () => {
		const plan = [oddMeal([{ name: 'Energy', value: 620, order: 1, value_unit: null }])];
		expect(energyAmount(dailyTotals(plan))).toMatchObject({ name: 'Energy', value: 620, unit: '' });
	});

	it('reads a value with no unit key at all', () => {
		const plan = [oddMeal([{ name: 'Energy', value: 620, order: 1 }])];
		expect(() => energyAmount(dailyTotals(plan))).not.toThrow();
	});

	it('skips a value with no name to key it by', () => {
		const plan = [oddMeal([{ name: null, value: 620, order: 1, value_unit: 'kcal' }])];
		expect(macroColumns(plan)).toEqual([]);
	});

	it('reads a meal carrying no values', () => {
		expect(macroColumns([oddMeal(null), oddMeal(undefined)])).toEqual([]);
	});

	it('treats a non-numeric amount as absent rather than as zero', () => {
		const plan = [oddMeal([{ name: 'Energy', value: '620', order: 1, value_unit: 'kcal' }])];
		const [column] = macroColumns(plan);
		expect(mealAmount(plan[0], column)).toBeNull();
	});

	it('orders meals whose order is missing', () => {
		const plan = [
			oddMeal([]),
			{ ...oddMeal([]), order: null, title: 'Lunch' } as unknown as NutritionMeal
		];
		expect(() => orderedMeals(plan)).not.toThrow();
	});

	it('shares out a day whose percentages are not numbers', () => {
		const plan = [
			{
				...oddMeal([{ name: 'Energy', value: 620, order: 1, value_unit: 'kcal' }]),
				percentage: null
			},
			{
				...oddMeal([{ name: 'Energy', value: 620, order: 1, value_unit: 'kcal' }]),
				percentage: null
			}
		] as unknown as NutritionMeal[];
		expect(mealShares(plan)).toEqual([50, 50]);
	});
});

describe('formatAmount', () => {
	it('writes big numbers whole, with a thousands separator', () => {
		expect(formatAmount(2480)).toBe('2,480');
		expect(formatAmount(619.6)).toBe('620');
	});

	it('keeps one decimal where the value is small enough to need it', () => {
		expect(formatAmount(2.45)).toBe('2.5');
		expect(formatAmount(0)).toBe('0');
	});

	it('does not print a number for something that is not one', () => {
		expect(formatAmount(NaN)).toBe('—');
		expect(formatAmount(Infinity)).toBe('—');
	});
});
