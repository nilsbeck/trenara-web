<script lang="ts">
	import type { ScheduledTraining } from '$lib/server/trenara/types';
	import {
		Footprints,
		Gauge,
		Loader2,
		Mountain,
		MoveHorizontal,
		SlidersHorizontal
	} from 'lucide-svelte';
	import CooldownIcon from '$lib/components/icons/cooldown-icon.svelte';
	import { chipSettings, type SettingKey } from '$lib/utils/session-setup';

	let {
		training,
		pending,
		onopen
	}: {
		training: ScheduledTraining;
		pending: SettingKey | null;
		/** A chip was tapped. `null` means the sliders button — open the index. */
		onopen: (key: SettingKey | null) => void;
	} = $props();

	const chips = $derived(chipSettings(training));

	const ICONS = {
		terrain: Mountain,
		shoe: Footprints,
		effort: Gauge,
		volume: MoveHorizontal,
		cooldown: CooldownIcon
	} as const;
</script>

<!--
	Every chip is both the applied value and the way in: what you see is what you
	tap. Chips matching the coach's plan stay muted; anything changed picks up a
	dot and a tinted border, so "what did I touch on this session" is one glance.
-->
<div class="mt-3 flex items-center gap-1.5">
	{#if chips.length === 0}
		<button
			type="button"
			onclick={() => onopen(null)}
			class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-muted px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
		>
			<SlidersHorizontal class="h-3.5 w-3.5" />
			Session setup
		</button>
	{:else}
		<!-- One line that scrolls, so a fourth chip never pushes the card taller. -->
		<div class="scrollbar-none flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
			{#each chips as chip (chip.key)}
				{@const Icon = ICONS[chip.key as keyof typeof ICONS]}
				<button
					type="button"
					onclick={() => onopen(chip.key)}
					class="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors {chip.changed
						? 'border-primary bg-primary/10 text-foreground'
						: 'border-border bg-muted text-muted-foreground hover:text-foreground'} {chip.value ==
					null
						? 'border-dashed bg-transparent'
						: ''}"
				>
					{#if pending === chip.key}
						<Loader2 class="h-3 w-3 animate-spin" />
					{:else if Icon}
						<Icon class="h-3 w-3" />
					{/if}
					{#if chip.changed}
						<span class="h-1 w-1 shrink-0 rounded-full bg-primary"></span>
					{/if}
					{chip.chipLabel ?? chip.value ?? chip.label}
				</button>
			{/each}
		</div>
		<button
			type="button"
			onclick={() => onopen(null)}
			aria-label="Session setup"
			class="shrink-0 rounded-full border border-border bg-muted p-1.5 text-muted-foreground transition-colors hover:text-foreground"
		>
			<SlidersHorizontal class="h-3.5 w-3.5" />
		</button>
	{/if}
</div>

<style>
	.scrollbar-none {
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.scrollbar-none::-webkit-scrollbar {
		display: none;
	}
</style>
