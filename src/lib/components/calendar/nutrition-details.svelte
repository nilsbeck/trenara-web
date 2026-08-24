<script lang="ts">
	import type { NutritionAdvice } from '$lib/server/trenara/types';
	import {
		dailyTotals,
		energyAmount,
		formatAmount,
		macroAmounts,
		macroColumns,
		mealAmount,
		mealShares,
		orderedMeals
	} from '$lib/utils/nutrition';
	import { Lightbulb, TriangleAlert, UtensilsCrossed } from 'lucide-svelte';

	let {
		selectedDate,
		nutritionDate,
		nutritionData,
		isLoading,
		error = null,
		onRetry
	}: {
		selectedDate: string | null;
		nutritionDate: string | null;
		nutritionData: NutritionAdvice | null;
		isLoading: boolean;
		error?: string | null;
		onRetry?: () => void;
	} = $props();

	const meals = $derived(orderedMeals(nutritionData?.plan));
	const columns = $derived(macroColumns(meals));
	const totals = $derived(dailyTotals(meals));
	const energy = $derived(energyAmount(totals));
	const macros = $derived(macroAmounts(totals));
	const shares = $derived(mealShares(meals));

	/*
		Both the day's totals and each meal lay their macros out on this grid, so
		the same macro sits in the same place down the whole tab and can be
		compared without reading a single label twice.

		It is `auto-fit` rather than a fixed column per macro because the macro
		names come from the API, in the account's language: a fixed set of columns
		fits "Carbs" and pushes "Koolhydraten" off the side of a phone. This one
		reflows to however many fit, and since every meal carries the same macro
		set they still line up.
	*/
	const macroGrid =
		'grid gap-x-3 gap-y-2 [grid-template-columns:repeat(auto-fit,minmax(4.5rem,1fr))]';
</script>

{#if isLoading}
	<div class="flex items-center justify-center py-8">
		<p class="text-sm text-muted-foreground">Loading...</p>
	</div>
	<!--
	A failure is not an empty day. Both used to land on "No nutrition data",
	which told a runner the coach had nothing for them when in fact the request
	had fallen over — and left them nothing to do about it.
-->
{:else if error}
	<div class="flex flex-col items-center gap-3 py-8 text-center">
		<TriangleAlert class="h-5 w-5 text-destructive" />
		<p class="text-sm text-foreground">{error}</p>
		{#if onRetry}
			<button
				type="button"
				onclick={onRetry}
				class="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
			>
				Try again
			</button>
		{/if}
	</div>
{:else if !nutritionData}
	<div class="flex items-center justify-center py-8">
		<p class="text-sm text-muted-foreground">No nutrition data for this day.</p>
	</div>
{:else}
	<div class="flex flex-col gap-4">
		<!-- Title -->
		<div>
			<div class="flex items-center gap-2">
				<UtensilsCrossed class="h-4 w-4 text-primary" />
				<h3 class="text-base font-semibold text-foreground">{nutritionData.title}</h3>
			</div>
			<p class="mt-0.5 text-xs text-muted-foreground">{nutritionDate ?? selectedDate}</p>
		</div>

		<!-- Description -->
		{#if nutritionData.description}
			<p class="text-sm leading-relaxed text-muted-foreground">{nutritionData.description}</p>
		{/if}

		{#if meals.length > 0}
			<!--
				The day's totals, before the meals that make them up.

				This is the number the runner opened the tab for — how much to eat
				today — and it was previously nowhere on the screen at all: it had to
				be added up by eye from a column of "Calories: 620" strings. Energy
				carries the panel as the headline and the macros sit under a rule as
				its composition, which is the relationship they actually have.
			-->
			{#if energy}
				<div class="rounded-xl border border-border bg-background/60 p-4">
					<h4 class="text-sm font-medium text-foreground">Total for the day</h4>
					<p class="mt-1 flex items-baseline gap-1.5">
						<span class="text-3xl font-semibold tabular-nums text-foreground">
							{formatAmount(energy.value)}
						</span>
						<span class="text-sm font-medium text-muted-foreground">{energy.unit}</span>
					</p>
					{#if macros.length > 0}
						<dl class="mt-3 border-t border-border pt-3 {macroGrid}">
							{#each macros as macro}
								<div class="min-w-0">
									<dt class="truncate text-[11px] text-muted-foreground" title={macro.name}>
										{macro.name}
									</dt>
									<dd class="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
										{formatAmount(macro.value)}<span
											class="ml-0.5 text-xs font-normal text-muted-foreground">{macro.unit}</span
										>
									</dd>
								</div>
							{/each}
						</dl>
					{/if}
				</div>
			{/if}

			<!--
				The breakdown, as one panel per meal in the shape of the totals panel
				above: the day and each meal are the same thing at two scales, so they
				are drawn the same way.

				Every meal is laid out against the macros of the whole day rather than
				only its own, with an em dash where a meal does not carry one. That
				keeps the macros in the same place in every panel — the old table
				stacked "name: value" strings per row, so reading the protein down the
				day meant finding a different line in each one.
			-->
			<div>
				<h4 class="mb-2 text-sm font-medium text-foreground">Meal breakdown</h4>
				<div class="flex flex-col gap-2">
					{#each meals as meal, index}
						{@const carries = columns.some((column) => mealAmount(meal, column) !== null)}
						<div class="rounded-lg border border-border bg-background/40 p-3">
							<div class="flex items-center gap-2">
								<!--
									The colour is the server's, per meal, and is the same one the
									mobile app paints. It stays a marker rather than becoming text
									or a fill behind text: several of those hues fail contrast on
									this ground.
								-->
								<span
									class="h-4 w-[3px] shrink-0 rounded-full"
									style="background-color: {meal.icon_background_color}"
								></span>
								<span class="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
									{meal.title}
								</span>
								{#if shares[index] > 0}
									<span
										class="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground"
									>
										{Math.round(shares[index])}% of day
									</span>
								{/if}
							</div>
							<!--
								A meal the API sends without any figures gets its name and
								nothing else. Laid out against the day's macros it became a
								row of em dashes — the heaviest thing on the card, saying
								only that there is nothing to say.
							-->
							{#if carries}
								<dl class="mt-2 {macroGrid}">
									{#each columns as column}
										{@const amount = mealAmount(meal, column)}
										<div class="min-w-0">
											<dt class="truncate text-[11px] text-muted-foreground" title={column.name}>
												{column.name}
											</dt>
											<dd class="mt-0.5 text-sm tabular-nums text-foreground">
												{#if amount === null}
													<span class="text-muted-foreground">—</span>
												{:else}
													{formatAmount(amount)}<span class="ml-0.5 text-xs text-muted-foreground"
														>{column.unit}</span
													>
												{/if}
											</dd>
										</div>
									{/each}
								</dl>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!--
			The coach's note sits under the numbers rather than above them: it reads
			as guidance on the plan, and floating it between the title and the totals
			pushed the one figure this tab exists for below the fold.
		-->
		{#if nutritionData.advice}
			<div
				class="flex items-start gap-2 rounded-lg border-l-2 border-primary bg-primary/5 px-3 py-2"
			>
				<Lightbulb class="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
				<p class="text-sm leading-relaxed text-foreground">{nutritionData.advice}</p>
			</div>
		{/if}
	</div>
{/if}
