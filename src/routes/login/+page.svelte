<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';
	import { Loader2 } from 'lucide-svelte';

	let formLoading = $state(false);
	let { form }: { form: ActionData } = $props();
</script>

<div class="flex min-h-screen flex-col items-center justify-center px-6 py-12">
	<div class="w-full max-w-sm space-y-8">
		<div class="text-center">
			<h1 class="text-3xl font-bold tracking-tight text-foreground">Trenara</h1>
			<p class="mt-2 text-sm text-muted-foreground">Sign in to your account</p>
		</div>

		{#if form?.message}
			<div class="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
				{form.message}
			</div>
		{/if}

		<form
			class="space-y-4"
			action="?/login"
			method="POST"
			use:enhance={() => {
				formLoading = true;
				return async ({ update }) => {
					formLoading = false;
					update();
				};
			}}
		>
			<div class="space-y-2">
				<label for="username" class="block text-sm font-medium text-foreground">Email</label>
				<input
					type="email"
					name="username"
					id="username"
					autocomplete="username"
					required
					class="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
					placeholder="you@example.com"
				/>
			</div>

			<div class="space-y-2">
				<label for="password" class="block text-sm font-medium text-foreground">Password</label>
				<input
					type="password"
					name="password"
					id="password"
					autocomplete="current-password"
					required
					class="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
				/>
			</div>

			<button
				type="submit"
				disabled={formLoading}
				class="flex w-full items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
			>
				{#if formLoading}
					<Loader2 class="mr-2 h-4 w-4 animate-spin" />
				{/if}
				Sign in
			</button>
		</form>
	</div>
</div>
