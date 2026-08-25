<script lang="ts">
	import type { TrainingStatus } from '$lib/stores/calendar.svelte';

	let {
		status,
		colour = null
	}: {
		status: TrainingStatus;
		/** The session's own colour, or null to fall back to the theme's status colour. */
		colour?: string | null;
	} = $props();

	/**
	 * Where a day has no session colour to borrow — a run logged off-plan, a
	 * strength session — the theme's own dots still say scheduled, done, missed.
	 */
	const FALLBACK: Record<string, string> = {
		scheduled: 'var(--color-dot-scheduled)',
		completed: 'var(--color-dot-completed)',
		missed: 'var(--color-dot-missed)'
	};

	const ink = $derived(colour ?? FALLBACK[status] ?? 'transparent');
</script>

<!--
	Colour says which session, shape says what became of it.

	Colour cannot carry both: once a session is drawn in its own colour, an
	intervals session and a missed one are both red. So the three states are
	three shapes — a dot still ahead, an asterisk done, a triangle missed — and
	each keeps the colour of the session it belongs to, which is what makes a
	month readable as "these were the hard ones, and these are the ones I ran".
-->
{#if status === 'completed'}
	<!-- Three strokes through a centre: legible at 8px where a glyph is not. -->
	<svg
		width="8"
		height="8"
		viewBox="0 0 8 8"
		aria-hidden="true"
		style="display:block;overflow:visible"
	>
		<g stroke={ink} stroke-width="1.4" stroke-linecap="round">
			<line x1="4" y1="0.6" x2="4" y2="7.4" />
			<line x1="1.06" y1="2.3" x2="6.94" y2="5.7" />
			<line x1="1.06" y1="5.7" x2="6.94" y2="2.3" />
		</g>
	</svg>
{:else if status === 'missed'}
	<span
		style="display:block;width:6px;height:6px;background:{ink};clip-path:polygon(50% 0%, 100% 100%, 0% 100%)"
	></span>
{:else if status === 'scheduled'}
	<span style="display:block;width:4px;height:4px;border-radius:9999px;background:{ink}"></span>
{/if}
