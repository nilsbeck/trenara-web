<script lang="ts">
	import type { NutritionAdvice } from '$lib/server/trenara/types';
	import {
		dailyTotals,
		energyAmount,
		formatAmount,
		macroColumns,
		mealAmount,
		mealShares,
		orderedMeals
	} from '$lib/utils/nutrition';
	import { Equal, Lightbulb, TriangleAlert, UtensilsCrossed } from 'lucide-svelte';

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
	const shares = $derived(mealShares(meals));

	/*
		Every meal is laid out against the macros of the whole day rather than only
		its own, with an em dash where a meal does not carry one. That keeps a macro
		on the same line of every card, so the day can be read down a column instead
		of card by card — which is the one thing the app's own screen leaves to the
		reader, since its cards only list what each meal happens to have.
	*/
	function rowsFor(meal: (typeof meals)[number]) {
		return columns.map((column) => ({ column, amount: mealAmount(meal, column) }));
	}
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

		{#if meals.length > 0}
			<!--
				The day's totals, before the meals that make them up, drawn the way the
				Food coach screen draws them: an outlined card under a badge, the
				figure on the left and what it measures on the right.

				Drawn in this tab's own primary rather than in the API's
				`icon_background_color`. That colour is the app's accent, not the
				web's, and the two are close enough that using it here read as a
				near-miss of the primary sitting a few pixels away on the tab rule and
				the header icon.
			-->
			<div class="relative mt-3.5 rounded-xl border-2 border-primary px-4 pb-4 pt-5">
				<span
					class="absolute -top-3.5 left-1/2 grid h-7 w-7 -translate-x-1/2 place-items-center rounded-full bg-primary"
				>
					<Equal class="h-4 w-4 text-white" />
				</span>
				<h4 class="text-center text-sm font-semibold text-foreground">Total for the day</h4>
				<dl class="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
					{#each totals as total (`${total.name}:${total.unit}`)}
						<!--
							`flex-row-reverse` so the figure reads first and the name sits at
							the right margin, while the markup keeps the term ahead of the
							description it belongs to.
						-->
						<div class="flex flex-row-reverse items-baseline justify-between gap-3">
							<dt class="truncate text-xs text-muted-foreground" title={total.name}>
								{total.name}
							</dt>
							<dd
								class="shrink-0 tabular-nums text-foreground"
								class:text-2xl={total === energy}
								class:font-semibold={total === energy}
								class:text-sm={total !== energy}
								class:font-medium={total !== energy}
							>
								{formatAmount(total.value)}{#if total.unit}<span
										class="ml-0.5 text-xs font-normal text-muted-foreground">{total.unit}</span
									>{/if}
							</dd>
						</div>
					{/each}
				</dl>
			</div>

			<!--
				The breakdown, two cards to a row as the app lays it out: six meals
				stacked one to a row is a lot of scrolling for cards this short.

				`auto-fit` rather than a fixed pair so the cards fall to one column
				where two will not fit — the calendar is a fixed 28rem today, but this
				card should not be the thing that decides that.
			-->
			<div>
				<h4 class="mb-4 text-sm font-medium text-foreground">Meal breakdown</h4>
				<div class="grid gap-x-3 gap-y-7 [grid-template-columns:repeat(auto-fit,minmax(9rem,1fr))]">
					{#each meals as meal, index (meal.title || index)}
						{@const rows = rowsFor(meal)}
						{@const carries = rows.some((row) => row.amount !== null)}
						<div class="relative rounded-xl border border-border bg-background/40 px-3 pb-3 pt-5">
							<!--
								The glyph is what tells one meal from another — a cup, a bolt,
								a moon — which is why the badge behind it is one colour on all
								of them and not six. Where the API sends no icon the badge
								keeps the colour and the shape, so a row of cards stays a row.
							-->
							<span
								class="absolute -top-3.5 left-1/2 grid h-7 w-7 -translate-x-1/2 place-items-center rounded-full bg-primary"
							>
								{#if meal.icon}
									<!--
										The glyph is served from the API's host, so it can fail to
										arrive. Hiding it leaves the badge as a plain disc — the
										shape and colour a row of cards is aligned on — rather
										than a broken-image mark in every one of them.
									-->
									<img
										src={meal.icon}
										alt=""
										class="h-4 w-4"
										onerror={(event) => {
											(event.currentTarget as HTMLImageElement).style.display = 'none';
										}}
									/>
								{:else}
									<UtensilsCrossed class="h-3.5 w-3.5 text-white" />
								{/if}
							</span>
							<p
								class="truncate text-center text-sm font-medium text-foreground"
								title={meal.title}
							>
								{meal.title}
							</p>

							<!--
								A meal the API sends no figures for keeps its name and drops the
								rows. Laid out against the day's macros it became a column of em
								dashes — the heaviest thing on the card, saying only that there
								is nothing to say.
							-->
							{#if carries}
								<dl class="mt-2 flex flex-col gap-1 border-t border-border pt-2">
									{#each rows as { column, amount } (`${column.name}:${column.unit}`)}
										<div class="flex flex-row-reverse items-baseline justify-between gap-2">
											<dt class="truncate text-xs text-muted-foreground" title={column.name}>
												{column.name}
											</dt>
											<dd class="shrink-0 text-sm tabular-nums text-foreground">
												{#if amount === null}
													<span class="text-muted-foreground">—</span>
												{:else}
													{formatAmount(amount)}{#if column.unit}<span
															class="ml-0.5 text-xs text-muted-foreground">{column.unit}</span
														>{/if}
												{/if}
											</dd>
										</div>
									{/each}
								</dl>
							{/if}

							<!--
								The share as a bar, not only as a number — the one thing the
								app's own screen does not show. Six meals between 7% and 30%
								have a shape, and reading it off six figures is work the bar
								does at a glance.
							-->
							{#if shares[index] > 0}
								<div class="mt-3">
									<div class="h-1 overflow-hidden rounded-full bg-muted">
										<div
											class="h-full rounded-full bg-primary"
											style="width: {Math.min(shares[index], 100)}%"
										></div>
									</div>
									<p class="mt-1 text-center text-[11px] tabular-nums text-muted-foreground">
										{Math.round(shares[index])}% of day
									</p>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!--
			The prose sits under the numbers rather than above them.

			Both of these read as guidance on the plan, and the standing preamble in
			particular runs to a paragraph that says the same thing every day — six
			lines of it between the title and the totals put the one figure this tab
			exists for below the fold, which is the whole thing it was rebuilt to
			stop doing.
		-->
		{#if nutritionData.description}
			<p class="text-sm leading-relaxed text-muted-foreground">{nutritionData.description}</p>
		{/if}

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
