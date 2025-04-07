<script lang="ts">
	import type { StrengthTraining } from '$lib/server/api/types';

	import Loading from '../loading.svelte';

	let {
		selectedDate,
		strengthData,
		isStrengthLoading
	}: {
		selectedDate: string | null;
		strengthData: StrengthTraining | null;
		isStrengthLoading: boolean;
	} = $props();
</script>

{#if isStrengthLoading}
	<Loading />
{:else if strengthData && selectedDate}
	<div class="md:py-4 dark:bg-gray-700 bg-gray-50 rounded-b-xl w-full">
		<div class="border-gray-400">
			<div class="flex justify-between items-center">
				<h2 class="card-title text-left text-gray-800 dark:text-gray-100">
					{strengthData.title}
				</h2>
			</div>
		</div>
	</div>
{:else}
	<p class="text-gray-800 dark:text-gray-100">No strength training data found.</p>
{/if}
