<script lang="ts">
	import { loadSanitizer } from '#lib/utils/sanitize.js';

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

	/**
	 * Fills the element it is attached to with the sanitised markup.
	 *
	 * An attachment rather than `bind:this` and an `$effect` that waited for the
	 * binding: it runs only once the element exists, so there is no "no element
	 * yet" case to guard, and it re-runs whenever `content` changes, with the
	 * cleanup of the previous run first. That cleanup is what stops an import
	 * still in flight for an older item from writing over a newer one.
	 *
	 * `content` is read here, synchronously, and not in the callbacks below.
	 * Read only there — as the effect this replaced did — nothing tracked it:
	 * the effect re-ran on `looksLikeMarkup`, which stays `true` from one piece
	 * of markup to the next, so new markup arriving after the first had loaded
	 * left the old one on screen.
	 */
	function sanitizedMarkup(target: HTMLDivElement) {
		const markup = content;
		let current = true;

		loadSanitizer()
			.then((sanitize) => {
				// The output of `#lib/utils/sanitize.js`, which is what the rule asks for;
				// assigned directly because `{@html}` would render during SSR, where
				// there is no sanitiser.
				// eslint-disable-next-line no-restricted-syntax
				if (current) target.innerHTML = sanitize(markup);
			})
			.catch(() => {
				// No sanitiser, no markup. The text is shown as text rather than
				// as nothing, and never as unsanitised HTML.
				if (current) target.textContent = markup;
			});

		return () => {
			current = false;
		};
	}
</script>

{#if looksLikeMarkup}
	<div
		{@attach sanitizedMarkup}
		class="news-content text-sm leading-relaxed text-card-foreground"
	></div>
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
