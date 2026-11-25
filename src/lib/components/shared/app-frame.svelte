<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** The line under the app's name: the greeting, or what stands in for it. */
		greeting: Snippet;
		/** The right-hand end of the bar: the account menu, or what stands in for it. */
		menu: Snippet;
		children: Snippet;
	}

	let { greeting, menu, children }: Props = $props();
</script>

<!--
	The signed-in frame: the navbar, and the column every page sits in.

	Its own component because two things draw it — the `(app)` layout, around
	every signed-in page, and the launch placeholder (`src/routes/launch`), which
	stands in for the dashboard while a slow connection is still bringing it.
	The placeholder is replaced by the real page in one step, so any difference
	between the two bars shows as the navbar jumping at the moment the plan
	appears. Drawn from the same markup, they cannot differ; a copy would drift
	the first time either was touched.
-->
<div class="min-h-screen bg-background text-foreground">
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
							{@render greeting()}
						</span>
					</span>
				</a>
			</div>

			<div class="flex shrink-0 items-center gap-2">
				{@render menu()}
			</div>
		</div>
	</nav>

	<main class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
		{@render children()}
	</main>
</div>
