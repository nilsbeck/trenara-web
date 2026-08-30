<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import {
		Check,
		CloudOff,
		Copy,
		DatabaseZap,
		LogIn,
		Hourglass,
		RefreshCw,
		SearchX,
		TriangleAlert,
		Loader2
	} from 'lucide-svelte';

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

	/**
	 * Which server could not answer.
	 *
	 * The plan lives on Trenara and the history lives in this app's own
	 * database, and they fail independently. Naming the wrong one sends the
	 * runner to check a service that is working — so the storage flag is read
	 * first, because a storage failure also carries a 503.
	 */
	const storage = $derived(page.error?.storage === true);

	/**
	 * Rate limiting is its own case, not a variety of "went wrong".
	 *
	 * Nothing is broken and nothing is lost — the app asked for too much at
	 * once and waiting genuinely fixes it, which is true of no other failure
	 * here. Saying "something went wrong" for it sends the runner looking for
	 * a fault that does not exist.
	 */
	const rateLimit = $derived(page.error?.rateLimit ?? null);
	const rateLimited = $derived(status === 429 || rateLimit !== null);

	const unreachable = $derived(
		!storage &&
			!rateLimited &&
			(UNREACHABLE_STATUSES.has(status) || page.error?.unreachable === true)
	);
	const notFound = $derived(status === 404);

	/**
	 * The session has ended.
	 *
	 * The one failure on this page with an obvious remedy, and the one it could
	 * not name: a 401 fell through every branch into "Something went wrong",
	 * under a Retry button that would fail again, identically, every time it was
	 * pressed. The guard in `hooks.server.ts` redirects rather than reaching
	 * here now, so this is the backstop for a 401 raised from somewhere else —
	 * a streamed promise resolving after the session went, most likely.
	 */
	const signedOut = $derived(status === 401 || status === 403);

	const title = $derived(
		signedOut
			? 'You have been signed out'
			: rateLimited
				? 'Too many requests, too quickly'
				: storage
					? 'Your history is not available'
					: unreachable
						? 'Trenara is not answering'
						: notFound
							? 'Nothing here'
							: 'Something went wrong'
	);

	/** The snapshot as it should be sent on: whole, and not reformatted by hand. */
	const report = $derived(rateLimit ? JSON.stringify(rateLimit, null, 2) : '');

	let copied = $state(false);

	async function copyReport() {
		try {
			await navigator.clipboard.writeText(report);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Clipboard blocked (an insecure origin, or permission refused). The
			// block is on screen and selectable, so there is still a way to send
			// it — no point reporting a failure to copy over the failure itself.
		}
	}

	const detail = $derived(
		signedOut
			? 'Your session has ended. Sign in again to pick up where you left off.'
			: (page.error?.message ??
					(notFound ? 'That page does not exist.' : 'The page could not be loaded.'))
	);

	/** Back to the login screen, and back here afterwards. */
	const signInHref = $derived(
		`/login?next=${encodeURIComponent(`${page.url.pathname}${page.url.search}`)}`
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
			class:bg-muted={signedOut || rateLimited || storage || unreachable || notFound}
			class:bg-destructive={!signedOut && !rateLimited && !storage && !unreachable && !notFound}
			class:opacity-90={!signedOut && !rateLimited && !storage && !unreachable && !notFound}
		>
			{#if signedOut}
				<LogIn class="h-7 w-7 text-muted-foreground" aria-hidden="true" />
			{:else if rateLimited}
				<Hourglass class="h-7 w-7 text-muted-foreground" aria-hidden="true" />
			{:else if storage}
				<DatabaseZap class="h-7 w-7 text-muted-foreground" aria-hidden="true" />
			{:else if unreachable}
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
			{#if rateLimited}
				<p class="text-sm text-muted-foreground">
					Trenara limits how often this app may ask for things, and a page was opened that asked for
					too many at once. Nothing is broken and nothing is lost — waiting a moment and trying
					again is all it needs.
				</p>
			{:else if storage}
				<!-- Said explicitly because the alternative reading is the alarming
				     one: an empty history page looks like lost training. -->
				<p class="text-sm text-muted-foreground">
					This is where the app keeps your own records, separately from Trenara. It could not be
					read just now — nothing has been deleted, and your plan is unaffected.
				</p>
			{:else if unreachable}
				<p class="text-sm text-muted-foreground">
					Your training plan is on Trenara's servers, and they could not be reached just now.
					Nothing you have done is lost.
				</p>
			{/if}
		</div>

		<div class="flex flex-col gap-2">
			{#if signedOut}
				<!-- Retrying a 401 fails identically every time; signing in is the
				     only thing that changes the outcome. -->
				<a
					href={signInHref}
					class="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
				>
					<LogIn class="h-4 w-4" aria-hidden="true" />
					Sign in again
				</a>
			{:else if !notFound}
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

		{#if rateLimit}
			<!--
				The whole snapshot, on screen and copyable.

				A 429 is only actionable with what went out before it, and this app
				is tried as a preview deployment where a server log is not somewhere
				anyone will look. So the trail is put in front of whoever hit it, in
				the form it should be sent on in.
			-->
			<details class="text-left" data-testid="rate-limit-report">
				<summary
					class="cursor-pointer text-center text-xs text-muted-foreground/70 hover:text-muted-foreground"
				>
					What was being requested
				</summary>

				<dl class="mt-3 space-y-1 text-xs text-muted-foreground">
					<div class="flex justify-between gap-3">
						<dt>Refused</dt>
						<dd class="text-right font-mono">{rateLimit.method} {rateLimit.path}</dd>
					</div>
					{#each rateLimit.windows as window (window.seconds)}
						<div class="flex justify-between gap-3">
							<dt>Sent in the last {window.seconds}s</dt>
							<dd class="text-right font-mono">{window.total}</dd>
						</div>
					{/each}
					{#if rateLimit.retryAfterSeconds !== null}
						<div class="flex justify-between gap-3">
							<dt>Retry after</dt>
							<dd class="text-right font-mono">{rateLimit.retryAfterSeconds}s</dd>
						</div>
					{/if}
				</dl>

				{#if rateLimit.windows[0]?.byPath.length}
					<p class="mt-3 text-xs font-medium text-muted-foreground">
						Busiest endpoints, last {rateLimit.windows[0].seconds}s
					</p>
					<ul class="mt-1 space-y-0.5">
						{#each rateLimit.windows[0].byPath.slice(0, 6) as row (row.path)}
							<li class="flex justify-between gap-3 font-mono text-xs text-muted-foreground">
								<span class="truncate">{row.path}</span>
								<span>×{row.count}</span>
							</li>
						{/each}
					</ul>
				{/if}

				<button
					type="button"
					onclick={copyReport}
					class="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
				>
					{#if copied}
						<Check class="h-3.5 w-3.5" aria-hidden="true" />
						Copied
					{:else}
						<Copy class="h-3.5 w-3.5" aria-hidden="true" />
						Copy the full report
					{/if}
				</button>

				<pre
					class="mt-2 max-h-56 overflow-auto rounded-md bg-muted p-2 text-left text-[10px] leading-relaxed text-muted-foreground">{report}</pre>

				<!-- Said here rather than left to be worked out from a surprising
				     count: on Vercel each instance keeps its own trail, so this is
				     a floor on what Trenara saw, never the total. -->
				<p class="mt-2 text-[10px] text-muted-foreground/70">
					Counts are from one server instance ({rateLimit.instance}), so the real total may be
					higher.
				</p>
			</details>
		{/if}

		<!--
			The status is the one thing worth keeping on screen: it is what
			separates "Trenara refused this" from "we broke", and the maintainer
			reads this page on a preview deployment rather than in a terminal.
		-->
		<p class="text-xs text-muted-foreground/70">Error {status}</p>
	</div>
</div>
