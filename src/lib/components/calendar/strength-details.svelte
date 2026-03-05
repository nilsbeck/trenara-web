<script lang="ts">
	import type { StrengthTraining } from '$lib/server/trenara/types';
	import { Dumbbell, Timer } from 'lucide-svelte';

	let {
		selectedDate,
		strengthData,
		isLoading
	}: {
		selectedDate: string | null;
		strengthData: StrengthTraining | null;
		isLoading: boolean;
	} = $props();
</script>

{#if isLoading}
	<div class="flex items-center justify-center py-8">
		<p class="text-sm text-muted-foreground">Loading...</p>
	</div>
{:else if !strengthData}
	<div class="flex items-center justify-center py-8">
		<p class="text-sm text-muted-foreground">No strength training for this day.</p>
	</div>
{:else}
	<div class="flex flex-col gap-4">
		<!-- Title -->
		<div>
			<div class="flex items-center gap-2">
				<Dumbbell class="h-4 w-4 text-primary" />
				<h3 class="text-base font-semibold text-foreground">{strengthData.title}</h3>
			</div>
			<p class="mt-0.5 text-xs text-muted-foreground">{selectedDate}</p>
		</div>

		<!-- Description -->
		{#if strengthData.description}
			<p class="text-sm text-muted-foreground leading-relaxed">{strengthData.description}</p>
		{/if}

		<!-- Rest info -->
		<div class="flex gap-4">
			<div class="flex items-center gap-1.5 text-sm text-muted-foreground">
				<Timer class="h-3.5 w-3.5" />
				<span>Rest between sets: {strengthData.rest_between_sets}s</span>
			</div>
			<div class="flex items-center gap-1.5 text-sm text-muted-foreground">
				<Timer class="h-3.5 w-3.5" />
				<span>Rest between exercises: {strengthData.rest_between_exercises}s</span>
			</div>
		</div>

		<!-- Exercises -->
		{#if strengthData.exercises && strengthData.exercises.length > 0}
			<div>
				<h4 class="mb-2 text-sm font-medium text-foreground">Exercises</h4>
				<div class="flex flex-col gap-2">
					{#each strengthData.exercises as exercise}
						<div class="rounded-lg bg-muted px-3 py-2">
							<p class="text-sm font-medium text-foreground">{exercise.name}</p>
							{#if exercise.howto}
								<p class="mt-1 text-xs text-muted-foreground">{exercise.howto}</p>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/if}
