<script lang="ts">
	import { AlertCircle } from 'lucide-svelte';

	let { message, onretry }: { message: string; onretry?: () => void } = $props();
</script>

<div class="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
	<div class="flex items-start gap-3">
		<AlertCircle class="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
		<div class="flex-1">
			<p class="text-sm font-medium text-destructive">{message}</p>
			{#if onretry}
				<button
					type="button"
					onclick={onretry}
					class="mt-2 text-sm font-medium text-destructive underline underline-offset-4 hover:text-destructive/80"
				>
					Try again
				</button>
			{/if}
		</div>
	</div>
</div>
