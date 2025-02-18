<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	let formLoading = $state(false);
</script>

<div class="flex min-h-full flex-col justify-center px-6 py-12 lg:px-8">
	{#if formLoading}
		<div class="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
			<svg
				class="mr-3 -ml-1 size-5 animate-spin text-white"
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
			>
				<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
				></circle>
				<path
					class="opacity-75"
					fill="currentColor"
					d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
				></path></svg
			>
			<p>Loading...</p>
		</div>
	{:else}
		<div>
			<h1>Hi, {data.userData?.first_name}!</h1>
			<form method="post" action="?/logout" use:enhance>
				<button
					class="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
					>Sign out</button
				>
			</form>
		</div>

		<ul>
			{#each data.schedule?.trainings ?? [] as training}
				<li>
					{new Date(training.day * 1000).toLocaleDateString()} - {training.title}
					<ul>
						<li>{training.description}</li>
						{#each training.training.blocks as block}
							<li>{block.text}</li>
							{#if block.blocks && block.blocks.length > 1}
								<li>Intervals: repeat {block.repeat} times</li>
								<ul>
									{#each block.blocks as innerBlock}
										<li>{innerBlock.text}</li>
									{/each}
								</ul>
							{/if}
							{#if block.blocks && block.blocks.length === 1}
								<li>
									{block.blocks[0].text}
									{block.blocks[0].distance}
									{block.blocks[0].distance_value}
									{block.blocks[0].distance_unit}
								</li>
							{/if}
						{/each}
					</ul>
				</li>
			{/each}
		</ul>
	{/if}
</div>
