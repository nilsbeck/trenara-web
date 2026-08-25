<script lang="ts">
	import type { ChatThread, User } from '$lib/server/trenara/types';
	import type { LayoutServerData } from './$types';
	import {
		Loader2,
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
	import WeekOverview from '$lib/components/stats/week-overview.svelte';
	import type { WeekProgress } from '$lib/utils/week-progress';
	import { formatUnread, type UnreadSummary } from '$lib/utils/news-unread';
	import { appConfig } from '$lib/stores/app-config.svelte';

	let { children, data }: { children: any; data: LayoutServerData } = $props();

	let menuOpen = $state(false);
	let userData = $state<User | null>(null);

	// Null while the badge is still streaming in, and also when it could not be
	// computed at all. Both mean the same thing to the navbar: show nothing.
	let newsUnread = $state<UnreadSummary | null>(null);

	// Seeds the chat bubble's unread badge before the bubble is ever opened.
	let chatThreads = $state<ChatThread[]>([]);
	let chatSeen = $state<Record<number, number>>({});
	const newsBadgeLabel = $derived(newsUnread ? formatUnread(newsUnread) : '');

	// This week's rings, streamed in behind the navbar. Null until it arrives,
	// and null again if it could not be loaded — both render as nothing, so the
	// bar does not reflow around a placeholder.
	let weekProgress = $state<WeekProgress | null>(null);

	// Seeds the served option lists once. Anything that misses them renders from
	// the constants instead, so there is nothing to wait for here.
	$effect(() => {
		data.appConfig.then((c) => appConfig.set(c)).catch(() => appConfig.set(null));
	});

	$effect(() => {
		data.userData
			.then((u) => {
				userData = u as User;
			})
			.catch(() => {
				userData = null;
			});
	});

	$effect(() => {
		data.newsBadge
			.then((badge) => {
				newsUnread = badge;
			})
			.catch(() => {
				newsUnread = null;
			});
	});

	$effect(() => {
		data.weekProgress
			.then((progress) => {
				weekProgress = progress;
			})
			.catch(() => {
				weekProgress = null;
			});
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
			<div class="flex items-center gap-4">
				<a href="/dashboard" class="flex items-center gap-2.5">
					<img src="/logo.svg" alt="" width="32" height="32" class="h-8 w-8" />
					<span
						class="flex flex-col leading-tight"
						title="This is an unofficial, unaffiliated third-party client. It is not developed, endorsed or supported by Trenara."
					>
						<span class="text-xl font-bold tracking-tight text-foreground">Trainara</span>
						<span class="text-xs text-muted-foreground">
							{#await data.userData}
								<Loader2 class="h-3 w-3 animate-spin text-muted-foreground" />
							{:then resolvedUser}
								Hi, {(resolvedUser as User).first_name}!
							{:catch}
								<span class="text-destructive">Could not load user data</span>
							{/await}
						</span>
					</span>
				</a>
			</div>

			<!--
				This week at a glance. Hidden on small screens, where the bar has room
				for the logo and the menu and nothing else — the dashboard shows the
				same numbers in full.
			-->
			{#if weekProgress}
				<div class="hidden md:flex md:flex-1 md:justify-center">
					<a
						href="/goal"
						class="rounded-md px-2 py-1 hover:bg-accent"
						aria-label="This week's training progress"
					>
						<WeekOverview progress={weekProgress} compact />
					</a>
				</div>
			{/if}

			<div class="flex items-center gap-2">
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
								class="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent md:hidden"
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

	<!-- Main Content -->
	<main class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
		{@render children()}
	</main>
</div>

<ChatBubble
	currentUserId={userData?.id ?? null}
	initialThreads={chatThreads}
	initialSeen={chatSeen}
/>
