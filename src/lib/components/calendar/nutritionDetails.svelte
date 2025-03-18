<script lang="ts">
	import type { NutritionAdvice } from '$lib/server/api/types';

	import Loading from '../loading.svelte';

	let {
		selectedDate,
		nutritionDate,
		nutritionData,
		isNutritionLoading
	}: {
		selectedDate: string | null;
		nutritionDate: string | null;
		nutritionData: NutritionAdvice | null;
		isNutritionLoading: boolean;
	} = $props();
</script>

{#if isNutritionLoading}
	<Loading />
{:else if nutritionData && nutritionDate == selectedDate}
	<div class="md:py-4 dark:bg-gray-700 bg-gray-50 rounded-b-xl w-full">
		<div class=" border-gray-400">
			<div class="flex justify-between items-center">
				<h2 class="card-title text-left">
					{nutritionData.title}
				</h2>
			</div>
			<table class="table w-full text-sm">
				<thead>
					<tr>
						<th>Time of day</th>
						<th>Values</th>
					</tr>
				</thead>
				<tbody>
					{#each nutritionData.plan as item}
						<tr>
							<td>{item.title}</td>
							<td>
								<ul>
									{#each item.values as value}
										<li>
											<span>• {value.name}</span>
											<span>{value.value}{value.value_unit}</span>
										</li>
									{/each}
								</ul>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
{:else}
	<p>No nutrition data found.</p>
{/if}
