<script>
	let { schedule } = $props();
</script>

{#each schedule.trainings ?? [] as training}
	<div class="card w-96 bg-base-100 shadow-sm">
		<div class="card-body">
			<div class="flex justify-between">
				<h2 class="text-3xl font-bold">{training.title}</h2>
				<span class="text-xl">{new Date(training.day * 1000).toLocaleDateString()}</span>
			</div>
			<p class="text-sm">{training.description}</p>
			<ul class="mt-6 flex flex-col gap-2 text-xs">
				{#each training.training.blocks as block}
					<li>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="size-4 me-2 inline-block text-success"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 13l4 4L19 7"
							/></svg
						>
						<span>{block.text}</span>
					</li>
					{#if block.blocks && block.blocks.length > 1}
						{#each block.blocks as innerBlock}
							<li>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="size-4 me-2 inline-block text-success"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M5 13l4 4L19 7"
									/></svg
								>
								<span>{innerBlock.text}</span>
							</li>
						{/each}
					{/if}
				{/each}
			</ul>

			<div class="mt-6">
				<button class="btn btn-primary btn-block">Subscribe</button>
			</div>
		</div>
	</div>
{/each}
