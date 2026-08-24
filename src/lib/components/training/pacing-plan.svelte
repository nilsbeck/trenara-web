<script lang="ts">
	import type { PacingPlanOption } from '$lib/server/trenara/types';
	import { Loader2 } from 'lucide-svelte';

	let {
		options,
		pending = false,
		onchange
	}: {
		options: PacingPlanOption[];
		/** A change is in flight, so every row is held until it lands. */
		pending?: boolean;
		onchange: (value: PacingPlanOption['value']) => void;
	} = $props();

	/**
	 * `value` is `null` on the "no pacing plan" option, so it cannot key the
	 * `{#each}` or the radio inputs. `order` is 1-based and unique per package.
	 */
	const name = 'pacing-plan';
</script>

<!--
	The pacing plan as the app itself shows it: three radio buttons, each under
	the coach's own words for that strategy. Not a chip and not a step scale —
	picking one rewrites the race into a different schedule of when to run how
	fast for how far, and the descriptions are how a runner tells them apart.

	Radios rather than buttons because that is what this is: one choice from a
	fixed set, always exactly one applied. That comes with the keyboard and
	screen-reader behaviour for free, which a row of pressed-state buttons has
	to imitate.
-->
<fieldset disabled={pending} class="flex flex-col gap-2">
	<legend class="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
		Pacing plan
		{#if pending}
			<Loader2 class="h-3.5 w-3.5 animate-spin text-muted-foreground" />
		{/if}
	</legend>

	{#each options as option (option.order)}
		{@const id = `${name}-${option.order}`}
		<!-- The focus ring goes on the row: the input itself is off-screen. -->
		<label
			for={id}
			class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-primary {option.selected
				? 'border-primary bg-primary/10'
				: 'border-border bg-muted hover:bg-foreground/5'} {pending
				? 'cursor-default opacity-60'
				: ''}"
		>
			<input
				{id}
				{name}
				type="radio"
				class="sr-only"
				checked={option.selected}
				onchange={() => onchange(option.value)}
			/>
			<!--
				The native control is visually replaced rather than restyled, so the
				mark below is decorative: the input above it is what is focused,
				announced and keyed through.
			-->
			<span
				aria-hidden="true"
				class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border {option.selected
					? 'border-primary'
					: 'border-muted-foreground'}"
			>
				{#if option.selected}
					<span class="h-2 w-2 rounded-full bg-primary"></span>
				{/if}
			</span>
			<span class="min-w-0 flex-1">
				<span class="block text-sm text-foreground">{option.title}</span>
				<span class="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
					{option.description}
				</span>
			</span>
		</label>
	{/each}
</fieldset>
