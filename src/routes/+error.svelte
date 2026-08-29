<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { CloudOff, RefreshCw, SearchX, TriangleAlert, Loader2 } from 'lucide-svelte';

	/**
	 * What the app shows when a load function threw.
	 *
	 * There was no error page at all, so every failure — a tunnel on the way to
	 * the dashboard included — rendered SvelteKit's built-in one: black text on
	 * white, the word "Internal Error", and no way forward but the back button.
	 * For an app whose data all comes from one upstream server over a phone
	 * connection, the connectivity case is not the rare one, and it is the one
	 * where a retry is likely to work.
	 */

	/** The statuses this app uses to say the failure was the connection, not the request. */
	const UNREACHABLE_STATUSES = new Set([408, 502, 503, 504]);

	const status = $derived(page.status);
	const unreachable = $derived(
		UNREACHABLE_STATUSES.has(status) || page.error?.unreachable === true
	);
	const notFound = $derived(status === 404);

	const title = $derived(
		unreachable ? 'Trenara is not answering' : notFound ? 'Nothing here' : 'Something went wrong'
	);

	const detail = $derived(
		page.error?.message ??
			(notFound ? 'That page does not exist.' : 'The page could not be loaded.')
	);

	let retrying = $state(false);

	/**
	 * Re-run the load that failed, without a full page load.
	 *
	 * `invalidateAll` keeps the session and the rest of the app in memory, which
	 * matters on the connection this is most likely to be pressed on. A retry
	 * that fails simply lands back here, so nothing needs reporting.
	 */
	async function retry() {
		retrying = true;
		try {
			await invalidateAll();
		} finally {
			retrying = false;
		}
	}
</script>

<svelte:head><title>{title}</title></svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center px-6 py-12">
	<div class="w-full max-w-sm space-y-6 text-center">
		<div
			class="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
			class:bg-muted={unreachable || notFound}
			class:bg-destructive={!unreachable && !notFound}
			class:opacity-90={!unreachable && !notFound}
		>
			{#if unreachable}
				<CloudOff class="h-7 w-7 text-muted-foreground" aria-hidden="true" />
			{:else if notFound}
				<SearchX class="h-7 w-7 text-muted-foreground" aria-hidden="true" />
			{:else}
				<TriangleAlert class="h-7 w-7 text-destructive-foreground" aria-hidden="true" />
			{/if}
		</div>

		<div class="space-y-2">
			<h1 class="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
			<p class="text-sm text-muted-foreground">{detail}</p>
			{#if unreachable}
				<p class="text-sm text-muted-foreground">
					Your training plan is on Trenara's servers, and they could not be reached just now.
					Nothing you have done is lost.
				</p>
			{/if}
		</div>

		<div class="flex flex-col gap-2">
			{#if !notFound}
				<button
					type="button"
					onclick={retry}
					disabled={retrying}
					class="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
				>
					{#if retrying}
						<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
						Trying again…
					{:else}
						<RefreshCw class="h-4 w-4" aria-hidden="true" />
						Try again
					{/if}
				</button>
			{/if}

			<a
				href="/dashboard"
				class="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
			>
				Back to the calendar
			</a>
		</div>

		<!--
			The status is the one thing worth keeping on screen: it is what
			separates "Trenara refused this" from "we broke", and the maintainer
			reads this page on a preview deployment rather than in a terminal.
		-->
		<p class="text-xs text-muted-foreground/70">Error {status}</p>
	</div>
</div>
