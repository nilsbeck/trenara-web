<script lang="ts">
	import type { ChatThread } from '$lib/server/trenara/types';
	import type { LayoutServerData } from './$types';
	import {
		ChevronDown,
		LogOut,
		LayoutDashboard,
		UserCircle,
		Target,
		History,
		Archive,
		Newspaper
	} from 'lucide-svelte';
	import ChatBubble from '$lib/components/chat/chat-bubble.svelte';
	import RenderFailure from '$lib/components/shared/render-failure.svelte';
	import { formatUnread, type UnreadSummary } from '$lib/utils/news-unread';
	import { appConfig } from '$lib/stores/app-config.svelte';

	let { children, data }: { children: any; data: LayoutServerData } = $props();

	let menuOpen = $state(false);

	/**
	 * The account, resolved by the load rather than awaited here.
	 *
	 * No state, no effect, no `{#await}`. The name and the avatar are in the
	 * server-rendered HTML, so they are on screen in the first paint and stay
	 * there: a re-run of the load brings the same strings, Svelte sees no
	 * change, and nothing in the navbar moves.
	 */
	const userData = $derived(data.userData);

	/**
	 * The unread count, resolved by the load like the account above it.
	 *
	 * Null means nothing unread, or a badge that could not be computed — both
	 * read as "show nothing". What it no longer means is "not here yet": the dot
	 * used to be missing from the first paint and appear afterwards, on the same
	 * button as the avatar.
	 */
	const newsUnread = $derived(data.newsBadge);

	// Seeds the chat bubble's unread badge before the bubble is ever opened.
	let chatThreads = $state<ChatThread[]>([]);
	let chatSeen = $state<Record<number, number>>({});
	const newsBadgeLabel = $derived(newsUnread ? formatUnread(newsUnread) : '');

	// Seeds the served option lists once. Anything that misses them renders from
	// the constants instead, so there is nothing to wait for here.
	$effect(() => {
		// Only a value replaces a value: a failed re-run must not throw away the
		// option lists the pickers are already rendering from.
		data.appConfig.then((c) => c && appConfig.set(c)).catch(() => {});
	});

	$effect(() => {
		data.chatBadge
			.then((badge) => {
				chatThreads = badge.threads;
				chatSeen = badge.seen;
			})
			.catch(() => {
				chatThreads = [];
				chatSeen = {};
			});
	});

	function toggleMenu() {
		menuOpen = !menuOpen;
	}

	function closeMenu() {
		menuOpen = false;
	}
</script>

<svelte:window onclick={closeMenu} />

<div class="min-h-screen bg-background text-foreground">
	<!-- Navbar -->
	<nav class="border-b border-border bg-card">
		<div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
			<div class="flex shrink-0 items-center gap-4">
				<a href="/dashboard" class="flex items-center gap-2.5">
					<img src="/logo.svg" alt="" width="32" height="32" class="h-8 w-8" />
					<span
						class="flex flex-col leading-tight"
						title="This is an unofficial, unaffiliated third-party client. It is not developed, endorsed or supported by Trenara."
					>
						<span class="text-xl font-bold tracking-tight text-foreground">Trainara</span>
						<span class="text-xs text-muted-foreground">
							<!--
								Rendered on the server, so there is no pending state to show
								and nothing to swap in afterwards. It used to be an `{#await}`
								over a streamed promise, which meant a spinner first — every
								page load, for a name that had not changed all day.
							-->
							{#if userData}
								Hi, {userData.first_name}!
							{:else}
								<span class="text-destructive">Could not load user data</span>
							{/if}
						</span>
					</span>
				</a>
			</div>

			<div class="flex shrink-0 items-center gap-2">
				<!-- User Menu -->
				<div class="relative">
					<button
						type="button"
						class="relative flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
						aria-label={newsBadgeLabel ? `Menu, ${newsBadgeLabel} unread news items` : 'Menu'}
						onclick={(e) => {
							e.stopPropagation();
							toggleMenu();
						}}
					>
						{#if userData?.profile_picture?.path}
							<img
								src={userData.profile_picture.path}
								alt="Profile"
								class="h-8 w-8 rounded-full object-cover"
							/>
						{:else}
							<UserCircle class="h-8 w-8 text-muted-foreground" />
						{/if}
						<ChevronDown class="h-4 w-4 text-muted-foreground" />
						<!--
							The menu is collapsed, so the count lives on the row inside it and
							only a dot shows out here — enough to say "there is something in
							here" without competing with the chat bubble for attention. The
							label is on the button, so this is decoration.
						-->
						{#if newsBadgeLabel}
							<span
								class="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-card"
								aria-hidden="true"
							></span>
						{/if}
					</button>

					{#if menuOpen}
						<div
							class="absolute right-0 z-50 mt-2 w-48 rounded-md border border-border bg-card py-1 shadow-lg"
							role="menu"
							tabindex="-1"
							onclick={(e) => e.stopPropagation()}
							onkeydown={(e) => e.key === 'Escape' && closeMenu()}
						>
							<a
								href="/dashboard"
								class="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent"
								role="menuitem"
								onclick={closeMenu}
							>
								<LayoutDashboard class="h-4 w-4" />
								Dashboard
							</a>
							<a
								href="/profile"
								class="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent"
								role="menuitem"
								onclick={closeMenu}
							>
								<UserCircle class="h-4 w-4" />
								Profile
							</a>
							<a
								href="/goal"
								class="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent sm:hidden"
								role="menuitem"
								onclick={closeMenu}
							>
								<Target class="h-4 w-4" />
								Goal/Predictions
							</a>
							<a
								href="/news"
								class="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent"
								role="menuitem"
								onclick={closeMenu}
							>
								<Newspaper class="h-4 w-4" />
								News
								{#if newsBadgeLabel}
									<span
										class="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground"
									>
										{newsBadgeLabel}
									</span>
								{/if}
							</a>
							<a
								href="/history"
								class="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent"
								role="menuitem"
								onclick={closeMenu}
							>
								<History class="h-4 w-4" />
								Prediction History
							</a>
							<a
								href="/goal/history"
								class="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent"
								role="menuitem"
								onclick={closeMenu}
							>
								<Archive class="h-4 w-4" />
								Goal History
							</a>
							<div class="my-1 border-t border-border"></div>
							<a
								href="/logout"
								class="flex items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-accent"
								role="menuitem"
								onclick={closeMenu}
							>
								<LogOut class="h-4 w-4" />
								Logout
							</a>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</nav>

	<!--
		Main Content.

		Inside a boundary so that a page component throwing mid-render costs the
		page and not the navbar: the menu above stays live, which is the
		difference between "this screen is broken" and "the app is broken".

		A boundary catches throws during rendering and in effects. It does not
		catch one inside an event handler or a promise callback — those are
		already handled where they happen, by the stores and the `network`
		helpers, and would be silent here.
	-->
	<main class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
		<svelte:boundary>
			{@render children()}

			{#snippet failed(error, reset)}
				<RenderFailure title="This page could not be shown" {error} {reset} />
			{/snippet}
		</svelte:boundary>
	</main>
</div>

<!--
	The bubble is chrome on every page, so it gets its own boundary rather than
	sharing the page's: a thread that will not render must not be able to take
	the dashboard behind it down. No fallback is drawn — a bubble that cannot
	render is better absent than replaced by a panel about itself.
-->
<svelte:boundary>
	<ChatBubble
		currentUserId={userData?.id ?? null}
		initialThreads={chatThreads}
		initialSeen={chatSeen}
	/>

	{#snippet failed()}{/snippet}
</svelte:boundary>
