<script lang="ts">
	import DOMPurify from 'dompurify';

	/**
	 * The body of a news item.
	 *
	 * Trenara sends this as a string that sometimes carries markup, and the only
	 * sanitiser this project has is browser-side, so the two cases are rendered
	 * differently rather than dangerously: plain text goes out with the server
	 * render, markup is sanitised and inserted once the browser has it. Nothing
	 * unsanitised is ever put in the document.
	 */
	let { content }: { content: string } = $props();

	const looksLikeMarkup = $derived(/<[a-z][\s\S]*>/i.test(content));

	let host: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (host && looksLikeMarkup) {
			host.innerHTML = DOMPurify.sanitize(content);
		}
	});
</script>

{#if looksLikeMarkup}
	<div bind:this={host} class="news-content text-sm leading-relaxed text-card-foreground"></div>
{:else}
	<p class="whitespace-pre-line text-sm leading-relaxed text-card-foreground">{content}</p>
{/if}

<style>
	.news-content :global(p) {
		margin-bottom: 0.5rem;
	}

	.news-content :global(a) {
		text-decoration: underline;
	}

	.news-content :global(ul),
	.news-content :global(ol) {
		margin-bottom: 0.5rem;
		padding-left: 1.25rem;
		list-style: revert;
	}
</style>
