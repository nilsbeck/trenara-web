<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';

	let { children } = $props();

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
