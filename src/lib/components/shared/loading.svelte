<script lang="ts">
	import { Loader2 } from 'lucide-svelte';

	let { text = 'Loading...' }: { text?: string } = $props();
</script>

<div class="flex items-center justify-center gap-2 py-8 text-muted-foreground">
	<Loader2 class="h-5 w-5 animate-spin" />
	<span>{text}</span>
</div>
