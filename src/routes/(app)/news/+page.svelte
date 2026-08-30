<script lang="ts">
	import type { PageServerData } from './$types';
	import type { NewsItem, Pagination } from '$lib/server/trenara/types';
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { ArrowLeft, ExternalLink, Loader2, Newspaper } from 'lucide-svelte';
	import NewsContent from '$lib/components/news/news-content.svelte';
	import { isNewer, isUnread, newestOf, type NewsMark } from '$lib/utils/news-unread';
	import { describeError, describeResponse } from '$lib/utils/network';

	let { data }: { data: PageServerData } = $props();

	/**
	 * Where the reader stood when the page opened — captured once, on purpose.
	 *
	 * Opening the feed marks it read, but the "New" flags have to survive that:
	 * a reader who came here because of a badge should be able to see which
	 * items raised it, not watch them turn ordinary as the page settles.
	 */
	// svelte-ignore state_referenced_locally
	const markOnArrival: NewsMark | null = data.mark;
	const now = Math.floor(Date.now() / 1000);

	// The page owns the list from here on — older pages are appended to it — so
	// these deliberately seed from the loaded data rather than tracking it.
	// svelte-ignore state_referenced_locally
	let items = $state<NewsItem[]>(data.news.data ?? []);
	// svelte-ignore state_referenced_locally
	let pagination = $state<Pagination>(data.news.pagination);
	let loadingMore = $state(false);
	let loadMoreError = $state<string | null>(null);

	const hasMore = $derived(pagination && pagination.current_page < pagination.total_pages);
	const newCount = $derived(items.filter((item) => isUnread(item, markOnArrival, now)).length);

	function formatDate(unixSeconds: number): string {
		return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}

	/**
	 * Tell the server the feed has been seen, now that it is on screen.
	 *
	 * Only ever moves forward — the server ignores an older mark anyway, but
	 * there is no reason to spend the request. The badge is invalidated rather
	 * than the whole page, so the dot clears without disturbing what is being
	 * read.
	 */
	async function markRead() {
		const newest = newestOf(items);
		if (!newest) return;
		if (markOnArrival && !isNewer(newest, markOnArrival)) return;

		try {
			const res = await fetch('/api/v1/news/read', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ lastSeenId: newest.id, lastSeenCreatedAt: newest.createdAt })
			});
			if (res.ok) {
				await invalidate('app:news');
			}
		} catch {
			// A badge that outlives its items for one more load is a small thing;
			// an error on a page the reader came here to read is not.
		}
	}

	async function loadMore() {
		if (loadingMore || !hasMore) return;
		loadingMore = true;
		loadMoreError = null;

		try {
			const res = await fetch(`/api/v1/news?page=${pagination.current_page + 1}`);
			if (!res.ok) throw new Error(await describeResponse(res, 'Could not load older news.'));
			const page = await res.json();
			items = [...items, ...(page.data ?? [])];
			pagination = page.pagination;
		} catch (e) {
			loadMoreError = describeError(e, 'Could not load older news.');
		} finally {
			loadingMore = false;
		}
	}

	onMount(markRead);
</script>

<svelte:head><title>News</title></svelte:head>

<div class="mx-auto max-w-3xl">
	<div class="mb-6">
		<a
			href="/dashboard"
			class="inline-flex items-center gap-1.5 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
			aria-label="Back to dashboard"
		>
			<ArrowLeft class="h-5 w-5" />
		</a>
	</div>

	<div class="mb-6 flex items-center gap-3">
		<Newspaper class="h-6 w-6 text-muted-foreground" />
		<h1 class="text-2xl font-bold text-foreground">News</h1>
		{#if newCount > 0}
			<span
				class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground"
			>
				{newCount} new
			</span>
		{/if}
	</div>

	{#if items.length === 0}
		<p class="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
			No news yet.
		</p>
	{:else}
		<div class="space-y-4">
			{#each items as item (item.id)}
				{@const unread = isUnread(item, markOnArrival, now)}
				<article
					class="rounded-lg border bg-card p-5 shadow-sm {unread
						? 'border-primary/60 ring-1 ring-primary/30'
						: 'border-border'}"
				>
					<div class="mb-2 flex items-start justify-between gap-3">
						<h2 class="text-lg font-semibold text-card-foreground">{item.title}</h2>
						{#if unread}
							<span
								class="mt-0.5 shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground"
							>
								New
							</span>
						{/if}
					</div>
					<p class="mb-3 text-xs text-muted-foreground">{formatDate(item.created_at)}</p>

					{#if item.attachment?.path}
						<img
							src={item.attachment.path}
							alt=""
							loading="lazy"
							class="mb-3 max-h-80 w-full rounded-md object-cover"
						/>
					{/if}

					<NewsContent content={item.content} />

					{#if item.video_url}
						<a
							href={item.video_url}
							target="_blank"
							rel="noopener noreferrer"
							class="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
						>
							<ExternalLink class="h-4 w-4" />
							Open link
						</a>
					{/if}
				</article>
			{/each}
		</div>

		{#if hasMore}
			<div class="mt-6 flex flex-col items-center gap-2">
				<button
					type="button"
					onclick={loadMore}
					disabled={loadingMore}
					class="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-60"
				>
					{#if loadingMore}
						<Loader2 class="h-4 w-4 animate-spin" />
					{/if}
					Older news
				</button>
				{#if loadMoreError}
					<p class="text-sm text-destructive">{loadMoreError}</p>
				{/if}
			</div>
		{/if}
	{/if}
</div>
