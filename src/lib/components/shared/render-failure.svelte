<script lang="ts">
	import { TriangleAlert, RefreshCw } from 'lucide-svelte';

	/**
	 * What is shown in place of a part of the app that threw while rendering.
	 *
	 * The server's failures have had an error page since the connection work;
	 * this is the other half. A component that throws *after* hydration — a
	 * field the API dropped, an index into an array that came back shorter than
	 * its type promised — was caught by nothing at all: SvelteKit logs it to a
	 * console nobody is looking at and leaves whatever had already rendered on
	 * screen, half-drawn and unresponsive.
	 *
	 * `reset` re-renders the subtree. Worth offering because the common cause is
	 * a single bad payload: the retry re-runs the render against whatever is in
	 * hand now, and lands back here if it is no better.
	 */
	let {
		title = 'This part could not be shown',
		error,
		reset
	}: {
		title?: string;
		error?: unknown;
		reset?: () => void;
	} = $props();

	/**
	 * The failure in one line, for the maintainer.
	 *
	 * On screen rather than in a terminal on purpose: branches are tried as
	 * Vercel preview deployments, where a console is not somewhere anyone will
	 * think to look. It is small and muted — the sentence above it is the part
	 * addressed to whoever is running.
	 */
	const detail = $derived(
		error instanceof Error && error.message ? error.message : error ? String(error) : null
	);
</script>

<div
	class="rounded-lg border border-border bg-card p-6 text-center"
	role="alert"
	data-testid="render-failure"
>
	<TriangleAlert class="mx-auto mb-3 h-6 w-6 text-muted-foreground" aria-hidden="true" />
	<p class="text-sm font-medium text-card-foreground">{title}</p>
	<p class="mt-1 text-sm text-muted-foreground">
		The rest of the app is unaffected — you can carry on elsewhere.
	</p>

	{#if reset}
		<button
			type="button"
			onclick={reset}
			class="mt-4 inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
		>
			<RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />
			Try again
		</button>
	{/if}

	{#if detail}
		<p class="mt-4 break-words text-xs text-muted-foreground/70">{detail}</p>
	{/if}
</div>
