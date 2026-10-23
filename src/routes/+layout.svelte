<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { browser } from '$app/env';
	import { injectSpeedInsights } from '@vercel/speed-insights';

	let { children } = $props();

	/**
	 * Vercel Speed Insights, reporting each vital against its route id.
	 *
	 * This used to be `injectSpeedInsights` from `@vercel/speed-insights/sveltekit`,
	 * called in `+layout.ts`. That wrapper imports `$app/stores`, which
	 * SvelteKit 3 removed and which now throws on import — so the root layout
	 * failed to hydrate and every page was left as dead server HTML: no data
	 * fetched, no click handled. No published version of the package is free of
	 * it yet (2.1.0-canary claims Kit 3 and still imports it), so the wrapper's
	 * few lines live here instead, on the framework-agnostic entry point:
	 * inject the script once with the current route, then keep the route
	 * current as the page changes. The two `VITE_VERCEL_OBSERVABILITY_*`
	 * values are what the wrapper read; Vercel sets them at build time.
	 */
	const speedInsights = browser
		? injectSpeedInsights(
				{
					route: page.route.id,
					framework: 'sveltekit',
					basePath: import.meta.env.VITE_VERCEL_OBSERVABILITY_BASEPATH
				},
				import.meta.env.VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG
			)
		: null;

	// Writes the route onto the injected script's dataset, which is outside
	// Svelte — the one thing an effect is for.
	$effect(() => {
		if (page.route.id) speedInsights?.setRoute(page.route.id);
	});

	/**
	 * The default browser-tab title for every route.
	 *
	 * News, the goal-share page, and the +error.svelte boundary already set
	 * their own via `<svelte:head>`. This has to stay out of their way: two
	 * `<title>` elements in the tree at once and the browser keeps the first
	 * one, silently overriding whichever a page set for itself.
	 */
	const ROUTES_WITH_OWN_TITLE = new Set(['/(app)/news', '/s/[token]']);
	const showDefaultTitle = $derived(!page.error && !ROUTES_WITH_OWN_TITLE.has(page.route.id ?? ''));
</script>

<svelte:head>
	{#if showDefaultTitle}
		<title>Trainara — your Trenara plan, with a better UI</title>
	{/if}
</svelte:head>

{@render children()}
