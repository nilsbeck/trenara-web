<script lang="ts">
	/**
	 * Reusable RPE (Rate of Perceived Exertion) slider with dynamic colour,
	 * title and description. Bind to `value` from the parent.
	 */
	import { rpeColors } from './rpe';

	let {
		value = $bindable(5)
	}: {
		value: number;
	} = $props();

	const rpeData = [
		{ title: 'Very light', description: 'Hardly any exertion, but more than sleeping or watching TV. Almost no muscle strain, just a very easy movement.' },
		{ title: 'Light', description: 'Feels like you can maintain this for hours. Easy to breathe and carry a conversation. Muscles feel relaxed with minimal strain, i.e., a recovery or LSD run.' },
		{ title: 'Light', description: 'Feels like you can maintain this for hours. Easy to breathe and carry a conversation. Muscles feel slightly engaged but not straining, i.e., a recovery or LSD run.' },
		{ title: 'Moderate', description: 'Breathing heavily, can hold a short conversation. Muscles start to feel some strain but still somewhat comfortable. Becoming noticeably challenging, i.e. an extensive interval or tempo session.' },
		{ title: 'Moderate', description: 'Breathing heavily, can hold a short conversation. Muscles are working harder and feeling some fatigue but still manageable. Becoming noticeably challenging, i.e. an extensive interval or tempo session.' },
		{ title: 'Moderate', description: 'Breathing heavily, can hold a short conversation. Muscles are working significantly, starting to feel fatigue and burn, i.e. an extensive interval or tempo session.' },
		{ title: 'Vigorous', description: 'Borderline uncomfortable. Short of breath, can speak a sentence. Muscles feel increasingly strained and tired but you can still push through, i.e. most tempo runs and intervals.' },
		{ title: 'Vigorous', description: 'Borderline uncomfortable. Short of breath, can speak a sentence. Muscles are burning and it is harder to maintain pace, i.e. most tempo runs and intervals.' },
		{ title: 'Very hard', description: 'Very difficult to maintain exercise intensity. Can barely breathe and speak only a few words. Muscles are near failure, feeling intense fatigue and strain, i.e. fast intervals.' },
		{ title: 'Max effort', description: "Feels almost impossible to keep going. Completely out of breath, unable to talk. Muscles are screaming with fatigue and you can't push any harder. Can only maintain for a very short time, i.e. very hard intervals with a high pace and little recovery time." }
	];

	const currentRpe = $derived(rpeData[value - 1]);
	const currentColor = $derived(rpeColors[value - 1]);
</script>

<!-- Dynamic title above the slider -->
<div class="mb-3 text-center">
	<span
		class="text-base font-semibold transition-colors duration-200"
		style="color: {currentColor}"
	>
		{value} – {currentRpe.title}
	</span>
</div>

<!-- Slider -->
<div class="relative">
	<input
		type="range"
		min="1"
		max="10"
		step="1"
		bind:value
		class="rpe-slider w-full h-2 rounded-full appearance-none cursor-pointer transition-all duration-200"
		style="--rpe-color: {currentColor};"
	/>
	<div class="flex justify-between mt-1.5 text-xs text-muted-foreground">
		{#each Array.from({ length: 10 }, (_, i) => i + 1) as n}
			<span
				class="w-5 text-center transition-all duration-150"
				style={n === value ? `color: ${currentColor}; font-weight: 600;` : ''}
			>{n}</span>
		{/each}
	</div>
</div>

<!-- Dynamic description below the slider -->
<div
	class="mt-4 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-all duration-200"
	style="background-color: {currentColor}18; border-left: 3px solid {currentColor};"
>
	{currentRpe.description}
</div>

<style>
	/* Track */
	.rpe-slider::-webkit-slider-runnable-track {
		height: 8px;
		border-radius: 9999px;
		background: color-mix(in srgb, var(--rpe-color) 25%, transparent);
	}
	.rpe-slider::-moz-range-track {
		height: 8px;
		border-radius: 9999px;
		background: color-mix(in srgb, var(--rpe-color) 25%, transparent);
	}

	/* Thumb */
	.rpe-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--rpe-color);
		border: 2px solid white;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
		margin-top: -6px;
		cursor: pointer;
	}
	.rpe-slider::-moz-range-thumb {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--rpe-color);
		border: 2px solid white;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
		cursor: pointer;
	}
</style>
