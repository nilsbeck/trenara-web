<script lang="ts">
    import type { StrengthTraining } from '$lib/server/api/types';

    let {
        selectedTrainingStrength
    }: {
        selectedTrainingStrength: StrengthTraining[];
    } = $props();
</script>

{#if selectedTrainingStrength.length > 0}
<div>

    {#if selectedTrainingStrength[0] as StrengthTraining}
        <h1>{selectedTrainingStrength[0].title}</h1>
    {/if}
</div>
{/if}
