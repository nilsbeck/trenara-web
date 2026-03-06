<script lang="ts">
	import type { PageServerData } from './$types';
	import type { User } from '$lib/server/trenara/types';
	import { Loader2, UserCircle, ArrowLeft } from 'lucide-svelte';

	let { data }: { data: PageServerData } = $props();
</script>

<div class="mx-auto max-w-lg">
	<div class="mb-6">
		<a
			href="/dashboard"
			class="inline-flex items-center gap-1.5 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
			aria-label="Back to dashboard"
		>
			<ArrowLeft class="h-5 w-5" />
		</a>
	</div>

{#await data.userData}
	<div class="flex items-center justify-center py-12">
		<Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
	</div>
{:then user}
	{@const u = user as User}
	<div>
		<div class="rounded-lg border border-border bg-card p-6 shadow-sm">
			<div class="mb-6 flex items-center gap-4">
				{#if u.profile_picture?.path}
					<img
						src={u.profile_picture.path}
						alt="Profile"
						class="h-16 w-16 rounded-full object-cover"
					/>
				{:else}
					<UserCircle class="h-16 w-16 text-muted-foreground" />
				{/if}
				<div>
					<h1 class="text-2xl font-bold text-card-foreground">Profile</h1>
					<p class="text-sm text-muted-foreground">{u.email}</p>
				</div>
			</div>

			<form class="space-y-6">
				<!-- Personal Data -->
				<fieldset class="space-y-3">
					<legend class="text-sm font-medium text-card-foreground">Personal Data</legend>

					<div class="grid grid-cols-2 gap-3">
						<div>
							<label for="firstName" class="mb-1 block text-xs text-muted-foreground">First Name</label>
							<input
								id="firstName"
								type="text"
								value={u.first_name}
								readonly
								class="w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-foreground"
							/>
						</div>
						<div>
							<label for="lastName" class="mb-1 block text-xs text-muted-foreground">Last Name</label>
							<input
								id="lastName"
								type="text"
								value={u.last_name}
								readonly
								class="w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-foreground"
							/>
						</div>
					</div>

					<div>
						<label for="dob" class="mb-1 block text-xs text-muted-foreground">Date of Birth</label>
						<input
							id="dob"
							type="text"
							value={u.date_of_birth}
							readonly
							class="w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-foreground"
						/>
					</div>

					<div>
						<label for="gender" class="mb-1 block text-xs text-muted-foreground">Gender</label>
						<input
							id="gender"
							type="text"
							value={u.gender}
							readonly
							class="w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-foreground"
						/>
					</div>
				</fieldset>

				<!-- Training Info -->
				<fieldset class="space-y-3">
					<legend class="text-sm font-medium text-card-foreground">Training Parameters</legend>

					<div class="grid grid-cols-2 gap-3">
						<div>
							<label for="weight" class="mb-1 block text-xs text-muted-foreground">
								Weight ({u.weight_unit})
							</label>
							<input
								id="weight"
								type="text"
								value={u.weight}
								readonly
								class="w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-foreground"
							/>
						</div>
						<div>
							<label for="height" class="mb-1 block text-xs text-muted-foreground">
								Height ({u.height_unit})
							</label>
							<input
								id="height"
								type="text"
								value={u.height}
								readonly
								class="w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-foreground"
							/>
						</div>
					</div>

					<div>
						<label for="weeklyTrainings" class="mb-1 block text-xs text-muted-foreground">
							Weekly Trainings
						</label>
						<input
							id="weeklyTrainings"
							type="text"
							value={u.weekly_trainings}
							readonly
							class="w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-foreground"
						/>
					</div>
				</fieldset>

				<!-- Subscription -->
				<fieldset class="space-y-3">
					<legend class="text-sm font-medium text-card-foreground">Subscription</legend>

					<div class="rounded-md bg-muted px-3 py-2">
						<p class="text-sm text-foreground">
							{u.premium_type} — {u.is_ultimate ? 'Ultimate' : u.is_starter ? 'Starter' : 'Free'}
						</p>
						<p class="text-xs text-muted-foreground">
							Active until {new Date(u.premium_until * 1000).toLocaleDateString()}
						</p>
					</div>
				</fieldset>
			</form>
		</div>
	</div>
{:catch}
	<p class="text-center text-sm text-destructive">Could not load user data.</p>
{/await}
</div>
