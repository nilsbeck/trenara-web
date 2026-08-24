<script lang="ts">
	import type { ScheduledTraining } from '$lib/server/trenara/types';
	import { Flag, Footprints, Gauge, Loader2, Mountain, MoveHorizontal } from 'lucide-svelte';
	import { chipSettings, type SettingKey } from '$lib/utils/session-setup';

	let {
		training,
		pending,
		onopen
	}: {
		training: ScheduledTraining;
		pending: SettingKey | null;
		onopen: (key: SettingKey) => void;
	} = $props();

	const chips = $derived(chipSettings(training));

	const ICONS = {
		terrain: Mountain,
		shoe: Footprints,
		pacing: Flag,
		effort: Gauge,
		volume: MoveHorizontal
	} as const;
</script>

<!--
	Every chip is both the applied value and the way in: what you see is what you
	tap. Every setting the runner can change from here has one — effort and
	volume included, even sitting at the planned step, because the chip is how
	you find out the option exists at all and the backend always has a value for
	them. Chips matching the coach's plan stay muted; anything changed picks up a
	dot and a tinted border, so "what did I touch on this session" is one glance.

	They wrap rather than scroll. A rail that scrolls hides its own contents at
	exactly the moment there are enough of them to be worth reading, and hiding
	settings is what this rail is for the opposite of. Wrapping costs a line of
	card height on the fullest sessions and nothing on the rest — and it is what
	lets every setting have a chip, which in turn is what makes the old trailing
	"Session setup" button unnecessary: there is nothing left behind it.
-->
{#if chips.length > 0}
	<div class="flex flex-wrap items-center gap-1.5">
		{#each chips as chip (chip.key)}
			{@const Icon = ICONS[chip.key as keyof typeof ICONS]}
			<button
				type="button"
				onclick={() => onopen(chip.key)}
				aria-busy={chip.awaiting ? 'true' : undefined}
				class="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors {chip.changed
					? 'border-primary bg-primary/10 text-foreground'
					: 'border-border bg-muted text-muted-foreground hover:text-foreground'} {chip.value ==
				null
					? 'border-dashed bg-transparent'
					: ''}"
			>
				<!--
					A chip whose value is not on this copy of the training yet spins
					in place of its icon: the setting is real — the flag says so — and
					only its current value is still coming.
				-->
				{#if pending === chip.key || chip.awaiting}
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
{/if}
