<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageServerData } from './$types';
	let { data }: { data: PageServerData } = $props();
	import type { User } from '$lib/server/api/types';
	import ScheduleCard from '$lib/components/schedule_card.svelte';
	import Loading from '$lib/components/loading.svelte';
</script>

<div class="flex min-h-full flex-col justify-center px-6 py-12 lg:px-8">
	<div class="flex justify-between">
		{#await data.userData}
			<Loading />
		{:then userData}
			<h1>Hi, {(userData as User).first_name}!</h1>
		{:catch error}
			<p>Could not load user data! {error}</p>
		{/await}
		<div>
			<form method="post" action="?/logout" use:enhance>
				<button
					class="rounded-md bg-indigo-600 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
					>Sign out</button
				>
			</form>
		</div>
	</div>

	{#await data.schedule}
		<div class="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
			<Loading />
		</div>
	{:then schedule}
		<div class="flex flex-col items-center justify-center">
			<ScheduleCard {schedule} />
		</div>
	{/await}
</div>
