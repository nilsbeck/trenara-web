<script lang="ts">
	import RenderFailure from './render-failure.svelte';
	import Thrower from './thrower.fixture.svelte';

	/**
	 * The arrangement the app layout uses: something that can throw, inside a
	 * boundary, with content beside it that must survive.
	 *
	 * Test fixture for `render-failure.test.ts`. Not part of the app.
	 */
	let { shouldThrow = true }: { shouldThrow?: boolean } = $props();
</script>

<nav>the navbar</nav>

<svelte:boundary>
	<Thrower {shouldThrow} />

	{#snippet failed(error, reset)}
		<RenderFailure title="This page could not be shown" {error} {reset} />
	{/snippet}
</svelte:boundary>
