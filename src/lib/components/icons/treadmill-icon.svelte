<script lang="ts">
	let { class: className = '' }: { class?: string } = $props();
</script>

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
	<!--
		The artwork is drawn within x 2.5-19.8 / y 2.6-19.5, which is smaller than the
		~2-22 box lucide icons fill. Scale it up around its own centre so it reads at the
		same optical size as its siblings, and pre-divide the stroke width so the scaled
		stroke still lands on lucide's 2.
	-->
	<g transform="translate(12 12) scale(1.15) translate(-11.15 -11.05)" stroke-width="1.74">
		<!-- runner -->
		<circle cx="10" cy="4.2" r="1.6" />
		<path d="M10 6.4v3.1l-1.8 2.3" />
		<path d="M10 8.3l2.7 1.5" />
		<path d="M8.2 11.8l-1.3 3.5" />
		<path d="M12.7 9.8l0.9 3.4" />
		<!-- treadmill deck -->
		<path d="M2.5 19.5h16" />
		<path d="M4.5 19.5l1.6-5.2" />
		<path d="M19.5 19.5l-1.4-7.6" />
		<!-- incline riser -->
		<path d="M17.5 9.8l2.3-2" />
	</g>
</svg>
