<script lang="ts">
	import type { User } from '$lib/server/trenara/types';
	import type { LayoutServerData } from './$types';
	import { Loader2, ChevronDown, LogOut, LayoutDashboard, UserCircle, Target, History, Archive } from 'lucide-svelte';
	import AddTrainingModal from '$lib/components/modals/add-training-modal.svelte';
	import ChatBubble from '$lib/components/chat/chat-bubble.svelte';

	let { children, data }: { children: any; data: LayoutServerData } = $props();

	let menuOpen = $state(false);
	let userData = $state<User | null>(null);

	$effect(() => {
		data.userData.then((u) => {
			userData = u as User;
		}).catch(() => {
			userData = null;
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
				<a href="/dashboard" class="text-xl font-bold tracking-tight text-foreground">Trenara</a>
				{#await data.userData}
					<Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
				{:then resolvedUser}
					<span class="text-sm text-muted-foreground">
						Hi, {(resolvedUser as User).first_name}!
					</span>
				{:catch}
					<span class="text-sm text-destructive">Could not load user data</span>
				{/await}
			</div>

			<div class="flex items-center gap-2">
				<AddTrainingModal />

				<!-- User Menu -->
				<div class="relative">
					<button
						type="button"
						class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
						onclick={(e) => { e.stopPropagation(); toggleMenu(); }}
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

<ChatBubble />
