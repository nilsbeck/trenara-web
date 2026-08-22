<script lang="ts">
	let { class: className = '' }: { class?: string } = $props();
</script>

<!-- A stepping-down profile: the session winding down at the end. -->
<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
>
	<path d="M3 6.5h5.5V12H14v5.5h7" />
</svg>
