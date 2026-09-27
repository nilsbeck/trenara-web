<script lang="ts">
	import { loadSanitizer } from '$lib/utils/sanitize';

	/**
	 * The body of a news item.
	 *
	 * Trenara sends this as a string that sometimes carries markup, and the only
	 * sanitiser this project has is browser-side, so the two cases are rendered
	 * differently rather than dangerously: plain text goes out with the server
	 * render, markup is sanitised and inserted once the browser has it. Nothing
	 * unsanitised is ever put in the document.
	 *
	 * The sanitiser loads DOMPurify only when first asked, so the ~27KB only
	 * travels for a feed that actually contains markup — most items are plain
	 * text and take the branch below instead.
	 */
	let { content }: { content: string } = $props();

	const looksLikeMarkup = $derived(/<[a-z][\s\S]*>/i.test(content));

	let host: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (!host || !looksLikeMarkup) return;

		const target = host;
		let current = true;

		loadSanitizer()
			.then((sanitize) => {
				// The prop can change while the import is in flight; only the
				// render this effect was started for may write to the node.
				// The output of `$lib/utils/sanitize`, which is what the rule asks for;
				// assigned directly because `{@html}` would render during SSR, where
				// there is no sanitiser.
				// eslint-disable-next-line no-restricted-syntax
				if (current) target.innerHTML = sanitize(content);
			})
			.catch(() => {
				// No sanitiser, no markup. The text is shown as text rather than
				// as nothing, and never as unsanitised HTML.
				if (current) target.textContent = content;
			});

		return () => {
			current = false;
		};
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
