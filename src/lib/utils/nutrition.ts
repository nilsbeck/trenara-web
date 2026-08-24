import type { NutritionAdvice } from '$lib/server/trenara/types';

export type NutritionMeal = NutritionAdvice['plan'][number];
export type NutritionValue = NutritionMeal['values'][number];

/*
	The plan comes straight from the API and is trusted for its shape only as
	far as its type says. In practice a value arrives with a null `value_unit`,
	and a meal with no `values` at all — so every field is read through these
	rather than reached into. A tab that throws while rendering never replaces
	what it drew last, which means one null unit shows a runner "Loading..."
	for ever.
*/
function text(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

/*
	An amount the API means as a number, whether or not it sent one as such.

	JSON from this API is not consistent about it — a value can arrive as 620 or
	as "620" — and refusing the string spends the reading of a whole macro to
	buy nothing: the em dash it leaves behind says "your coach did not plan
	this", which is a different and worse claim than the truth.
*/
function finite(value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

/** One macro column: the name the API gives it, and the unit its values carry. */
export interface MacroColumn {
	name: string;
	unit: string;
	order: number;
}

/** A macro column with a number attached — a daily total, or one meal's share. */
export interface MacroAmount extends MacroColumn {
	value: number;
}

/**
 * Meals in the order the coach means them to be eaten.
 *
 * The API is not reliably sorted, and breakfast listed after dinner makes the
 * breakdown unreadable no matter how it is styled.
 */
export function orderedMeals(plan: NutritionMeal[] | null | undefined): NutritionMeal[] {
	return [...(plan ?? [])]
		.filter((meal) => meal != null)
		.sort((a, b) => (finite(a.order) ?? 0) - (finite(b.order) ?? 0));
}

/**
 * The macros every meal is measured in, as columns.
 *
 * Meals do not all carry the same values — a snack may list energy and carbs
 * only — so the columns are the union across the day. Rendering every meal
 * against the same columns is what lets the breakdown be scanned down a
 * column instead of read meal by meal.
 */
export function macroColumns(plan: NutritionMeal[] | null | undefined): MacroColumn[] {
	const columns = new Map<string, MacroColumn>();
	for (const meal of plan ?? []) {
		for (const value of meal?.values ?? []) {
			const name = text(value?.name);
			if (!name) continue;
			const order = finite(value?.order) ?? 0;
			const existing = columns.get(name);
			// Keep the lowest order seen: it decides where the column sits, and a
			// meal that happens to list its macros in an odd order should not move
			// the column for every other meal.
			if (!existing || order < existing.order) {
				columns.set(name, { name, unit: text(value?.value_unit), order });
			}
		}
	}
	return [...columns.values()].sort((a, b) => a.order - b.order);
}

/** One meal's value for a column, or null when the meal does not carry it. */
export function mealAmount(meal: NutritionMeal, column: MacroColumn): number | null {
	const match = (meal?.values ?? []).find((value) => text(value?.name) === column.name);
	return match ? finite(match.value) : null;
}

/** The day's totals, one per macro column. */
export function dailyTotals(plan: NutritionMeal[] | null | undefined): MacroAmount[] {
	const meals = plan ?? [];
	return macroColumns(meals).map((column) => ({
		...column,
		value: meals.reduce((sum, meal) => sum + (mealAmount(meal, column) ?? 0), 0)
	}));
}

/**
 * The energy column — the one that belongs at the top of the card as the day's
 * headline number, with the rest reading as its composition.
 *
 * Matched on the unit rather than the name so it survives the API answering in
 * another language, which it does for meal titles already.
 */
export function energyAmount(totals: MacroAmount[]): MacroAmount | null {
	return (
		totals.find((total) => /^(kcal|cal|kj)$/i.test(text(total.unit).trim())) ?? totals[0] ?? null
	);
}

/** The totals that are not the headline energy figure. */
export function macroAmounts(totals: MacroAmount[]): MacroAmount[] {
	const energy = energyAmount(totals);
	return totals.filter((total) => total !== energy);
}

/**
 * Each meal's share of the day, as a percentage.
 *
 * `percentage` comes from the API but not on a documented scale — some fields
 * on this API are fractions and some are already percentages — so it is only
 * trusted when the meals add up to one whole day on one of those two readings.
 * Failing that the share is computed from the energy column, which is the same
 * quantity and is already on screen.
 */
export function mealShares(plan: NutritionMeal[] | null | undefined): number[] {
	const meals = plan ?? [];
	if (meals.length === 0) return [];

	const raw = meals.map((meal) => finite(meal?.percentage) ?? 0);
	const sum = raw.reduce((total, value) => total + value, 0);
	if (Math.abs(sum - 100) < 5) return raw;
	if (Math.abs(sum - 1) < 0.05) return raw.map((value) => value * 100);

	const energy = energyAmount(dailyTotals(meals));
	if (!energy || energy.value <= 0) return meals.map(() => 0);
	return meals.map((meal) => ((mealAmount(meal, energy) ?? 0) / energy.value) * 100);
}

/**
 * Numbers as a person would write them: whole where the value is big enough
 * that a decimal is noise, one decimal where it is not.
 */
export function formatAmount(value: number): string {
	if (!Number.isFinite(value)) return '—';
	const rounded = Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
	return rounded.toLocaleString('en-US');
}
