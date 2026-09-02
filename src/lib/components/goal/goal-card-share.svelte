<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { Share2, X, Copy, Check, Loader2, RefreshCw, Trash2 } from 'lucide-svelte';
	import { describeError, describeResponse } from '$lib/utils/network';
	import type { ShareRow } from '$lib/server/db/goal-share';

	/**
	 * The runner's own share link for the goal on screen, or null.
	 *
	 * Comes from `/goal`'s `load` rather than a fetch this component makes on
	 * mount: §5 of `agents.md` rules out `onMount` for data a `load` can
	 * already hold, and the load runs server-side with the runner already
	 * resolved. That is also why there is no third, "unknown" state here —
	 * only *none* and *live* — and why the two mutations below end with
	 * `invalidateAll()` rather than updating a local copy: the new state comes
	 * back through the same load that seeded this one, so there is exactly one
	 * source for it rather than two that could disagree.
	 */
	let { share }: { share: Pick<ShareRow, 'token' | 'title'> | null } = $props();

	let dialogEl: HTMLDialogElement | undefined = $state();
	let title = $state('');
	let pending = $state<'create' | 'rotate' | 'revoke' | null>(null);
	let error = $state<string | null>(null);
	let copied = $state(false);
	let urlInputEl: HTMLInputElement | undefined = $state();

	const url = $derived(share ? `${page.url.origin}/s/${share.token}` : null);

	function open() {
		title = share?.title ?? '';
		error = null;
		copied = false;
		dialogEl?.showModal();
	}

	function close() {
		dialogEl?.close();
	}

	async function send(method: 'POST' | 'PUT' | 'DELETE', kind: typeof pending) {
		pending = kind;
		error = null;
		try {
			const res = await fetch('/api/v1/goal-share', {
				method,
				...(method === 'DELETE'
					? {}
					: { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) })
			});
			if (!res.ok) {
				throw new Error(await describeResponse(res, 'That could not be saved.'));
			}
			// The share row this dialog reads comes from `/goal`'s load, so the
			// new state arrives through the same path rather than through a
			// second, possibly disagreeing one.
			await invalidateAll();
		} catch (e) {
			error = describeError(e, 'That could not be saved.');
		} finally {
			pending = null;
		}
	}

	const create = () => send('POST', 'create');
	const rotate = () => send('PUT', 'rotate');
	const revoke = () => send('DELETE', 'revoke');

	async function copyLink() {
		if (!url) return;
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// No Clipboard API (or it was refused) — the URL is already sitting in
			// a readonly input; select it so copying is one keystroke away.
			urlInputEl?.select();
		}
	}
</script>

<button
	type="button"
	onclick={open}
	aria-label="Share this goal"
	class="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
>
	<Share2 class="h-4 w-4" aria-hidden="true" />
</button>

<dialog
	bind:this={dialogEl}
	class="fixed top-1/2 left-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-0 shadow-xl backdrop:bg-black/50"
	onclick={(e) => {
		if (e.target === dialogEl) close();
	}}
>
	<div class="p-6">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-lg font-semibold text-card-foreground">Share this goal</h2>
			<button
				type="button"
				onclick={close}
				class="rounded-md p-1 text-muted-foreground hover:text-card-foreground"
				aria-label="Close"
			>
				<X class="h-5 w-5" />
			</button>
		</div>

		<p class="mb-4 text-sm text-muted-foreground">
			Anyone with this link can see your goal card — the target, your progress and the prediction
			graph — without an account of their own. It updates each time you open Trainara, and you can
			revoke it at any time.
		</p>

		{#if share && url}
			<label class="mb-4 block">
				<span class="mb-1.5 block text-xs font-medium text-muted-foreground">Link</span>
				<div class="flex items-center gap-2">
					<input
						bind:this={urlInputEl}
						type="text"
						readonly
						value={url}
						onclick={(e) => (e.target as HTMLInputElement).select()}
						class="min-w-0 flex-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-card-foreground"
					/>
					<button
						type="button"
						onclick={copyLink}
						class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
					>
						{#if copied}
							<Check class="h-3.5 w-3.5 text-primary" aria-hidden="true" />
							<span class="sr-only">Copied</span>
						{:else}
							<Copy class="h-3.5 w-3.5" aria-hidden="true" />
							Copy
						{/if}
					</button>
				</div>
			</label>

			{#if error}
				<p class="mb-4 text-sm text-destructive" role="alert">{error}</p>
			{/if}

			<div class="flex items-center justify-end gap-3">
				<button
					type="button"
					disabled={pending !== null}
					onclick={revoke}
					data-testid="revoke-button"
					class="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
				>
					{#if pending === 'revoke'}
						<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
						<span role="status"><span class="sr-only">Revoking…</span>Revoking…</span>
					{:else}
						<Trash2 class="h-4 w-4" aria-hidden="true" />
						Revoke
					{/if}
				</button>
				<button
					type="button"
					disabled={pending !== null}
					onclick={rotate}
					data-testid="rotate-button"
					class="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
				>
					{#if pending === 'rotate'}
						<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
						<span role="status"><span class="sr-only">Creating new link…</span>Creating…</span>
					{:else}
						<RefreshCw class="h-4 w-4" aria-hidden="true" />
						Create new link
					{/if}
				</button>
			</div>
		{:else}
			<label class="mb-4 block">
				<span class="mb-1.5 block text-xs font-medium text-muted-foreground">
					Title (optional)
				</span>
				<input
					type="text"
					bind:value={title}
					maxlength="80"
					placeholder={share ? '' : 'e.g. Berlin Marathon'}
					class="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
				/>
			</label>

			{#if error}
				<p class="mb-4 text-sm text-destructive" role="alert">{error}</p>
			{/if}

			<div class="flex items-center justify-end gap-3">
				<button
					type="button"
					onclick={close}
					class="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-card-foreground"
				>
					Cancel
				</button>
				<button
					type="button"
					disabled={pending !== null}
					onclick={create}
					data-testid="create-button"
					class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
				>
					{#if pending === 'create'}
						<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
						<span role="status"><span class="sr-only">Creating…</span>Creating…</span>
					{:else}
						Create link
					{/if}
				</button>
			</div>
		{/if}
	</div>
</dialog>
