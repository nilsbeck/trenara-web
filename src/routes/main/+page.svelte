<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageServerData } from './$types';
	let { data }: { data: PageServerData } = $props();
	import type { User } from '$lib/server/api/types';
	import ScheduleCard from '$lib/components/schedule_card.svelte';
	import Loading from '$lib/components/loading.svelte';
</script>

<div class="flex min-h-full flex-col justify-center px-6 py-12 lg:px-8">
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
