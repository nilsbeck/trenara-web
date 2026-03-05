<script lang="ts">
	import type { NutritionAdvice } from '$lib/server/trenara/types';
	import { UtensilsCrossed } from 'lucide-svelte';

	let {
		selectedDate,
		nutritionDate,
		nutritionData,
		isLoading
	}: {
		selectedDate: string | null;
		nutritionDate: string | null;
		nutritionData: NutritionAdvice | null;
		isLoading: boolean;
	} = $props();
</script>

{#if isLoading}
	<div class="flex items-center justify-center py-8">
		<p class="text-sm text-muted-foreground">Loading...</p>
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
			<p class="text-sm text-muted-foreground leading-relaxed">{nutritionData.description}</p>
		{/if}

		<!-- Advice -->
		{#if nutritionData.advice}
			<div class="rounded-lg bg-muted px-3 py-2">
				<p class="text-sm text-foreground leading-relaxed">{nutritionData.advice}</p>
			</div>
		{/if}

		<!-- Meal plan table -->
		{#if nutritionData.plan && nutritionData.plan.length > 0}
			<div>
				<h4 class="mb-2 text-sm font-medium text-foreground">Meal Plan</h4>
				<div class="overflow-hidden rounded-lg border border-border">
					<table class="w-full text-sm">
						<thead>
							<tr class="bg-muted">
								<th class="px-3 py-2 text-left font-medium text-muted-foreground">Meal</th>
								<th class="px-3 py-2 text-right font-medium text-muted-foreground">Values</th>
							</tr>
						</thead>
						<tbody>
							{#each nutritionData.plan as meal}
								<tr class="border-t border-border">
									<td class="px-3 py-2">
										<div class="flex items-center gap-2">
											<span
												class="inline-block h-2.5 w-2.5 rounded-full"
												style="background-color: {meal.icon_background_color}"
											></span>
											<span class="text-foreground">{meal.title}</span>
										</div>
									</td>
									<td class="px-3 py-2 text-right">
										<div class="flex flex-col items-end gap-0.5">
											{#each meal.values as val}
												<span class="text-xs text-muted-foreground">
													{val.name}: {val.value}{val.value_unit}
												</span>
											{/each}
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	</div>
{/if}
