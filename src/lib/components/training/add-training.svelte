<script lang="ts">
	import { Loader2, Plus, X } from 'lucide-svelte';
	import { AddTrainingStore } from '$lib/stores/add-training.svelte';

	let {
		date,
		onAdded
	}: {
		/** The empty day, `YYYY-MM-DD`. The parent re-creates this component per day. */
		date: string;
		/** A session was added; the plan around it needs fetching again. */
		onAdded: () => void | Promise<unknown>;
	} = $props();

	// One store per day, owned here. `date` is captured on purpose: the parent
	// keys this component by day, so a new day is a new instance.
	// svelte-ignore state_referenced_locally
	const store = new AddTrainingStore(date, () => onAdded());

	/** "8km · 47:27", from whichever of the two the session has. */
	function summary(total: string | null | undefined, time: string | null | undefined): string {
		return [total, time].filter(Boolean).join(' · ');
	}
</script>

{#if store.phase === 'closed'}
	<button
		type="button"
		class="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-8 text-sm font-medium text-foreground transition-colors hover:bg-muted"
		onclick={() => void store.open()}
	>
		<Plus class="h-4 w-4" aria-hidden="true" />
		Add a training
	</button>
{:else}
	<div class="flex flex-col gap-3" data-testid="add-training-picker">
		<div class="flex items-center justify-between gap-2">
			<h3 class="text-sm font-semibold text-foreground">Add a training</h3>
			<button
				type="button"
				class="rounded-md p-1 text-muted-foreground hover:text-foreground"
				aria-label="Close"
				onclick={() => store.close()}
			>
				<X class="h-4 w-4" aria-hidden="true" />
			</button>
		</div>

		{#if store.phase === 'loading'}
			<div
				class="flex min-h-32 items-center justify-center gap-2 text-muted-foreground"
				role="status"
				data-testid="add-training-loading"
			>
				<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
				<span class="sr-only">Loading the sessions you can add</span>
				<span class="text-sm" aria-hidden="true">Looking for sessions…</span>
			</div>
		{:else if store.phase === 'full'}
			<p class="py-4 text-sm text-muted-foreground">
				This week already has as many sessions as Trenara will plan. Remove one to make room.
			</p>
		{:else if store.phase === 'empty'}
			<p class="py-4 text-sm text-muted-foreground">
				Trenara has no session to offer for this day.
			</p>
		{:else if store.phase === 'failed'}
			<div class="flex flex-col items-start gap-2 py-2">
				<p class="text-sm text-destructive">{store.error}</p>
				<button
					type="button"
					class="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
					onclick={() => void store.open()}
				>
					Try again
				</button>
			</div>
		{:else}
			<p class="text-xs text-muted-foreground">Pick the session you want on this day.</p>
			<ul class="flex flex-col gap-2">
				{#each store.candidates as candidate (candidate.id)}
					<li>
						<button
							type="button"
							class="flex w-full items-stretch gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted disabled:opacity-60"
							disabled={store.adding !== null}
							aria-busy={store.adding === candidate.id}
							onclick={() => void store.add(candidate.id)}
						>
							<span
								class="w-1 shrink-0 rounded-full"
								style="background-color: {candidate.hex_training}"
								aria-hidden="true"
							></span>
							<span class="flex min-w-0 flex-1 flex-col gap-1">
								<span class="flex items-center justify-between gap-2">
									<span class="font-medium text-foreground">{candidate.title}</span>
									{#if store.adding === candidate.id}
										<Loader2 class="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
									{:else}
										<span class="shrink-0 text-xs text-muted-foreground">
											{summary(candidate.training.total_distance, candidate.training.total_time)}
										</span>
									{/if}
								</span>
								{#if candidate.description}
									<span class="line-clamp-3 text-xs text-muted-foreground"
										>{candidate.description}</span
									>
								{/if}
							</span>
						</button>
					</li>
				{/each}
			</ul>
			{#if store.addError}
				<p class="text-sm text-destructive" role="alert">{store.addError}</p>
			{/if}
		{/if}
	</div>
{/if}
