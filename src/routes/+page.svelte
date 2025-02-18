<script lang='ts'>
	import { enhance } from '$app/forms';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();
</script>

<div>
	<h1>Hi, {data.userData?.first_name}!</h1>
	<form method='post' action='?/logout' use:enhance>
		<button>Sign out</button>
	</form>
</div>

<ul>
	{#each data.schedule?.trainings ?? [] as training}
		<li>{new Date(training.day * 1000).toLocaleDateString()} - {training.title}
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
