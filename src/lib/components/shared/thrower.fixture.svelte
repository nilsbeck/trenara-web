<script lang="ts">
	/**
	 * A component that fails the way a real one does: while rendering, on a
	 * field the API was expected to send and did not.
	 *
	 * Test fixture for `render-failure.test.ts`. Not part of the app.
	 */
	let { shouldThrow = true }: { shouldThrow?: boolean } = $props();

	// Throwing on the initial value is exactly the point: this stands in for a
	// component that cannot render the payload it was given.
	// svelte-ignore state_referenced_locally
	if (shouldThrow) {
		throw new TypeError("Cannot read properties of null (reading 'split')");
	}
</script>

<p>the component rendered</p>
