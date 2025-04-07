<script lang="ts">
    import { onMount } from 'svelte';
    import { logError } from '$lib/utils/error-handling';

    export let fallback: string = 'Something went wrong. Please try again.';
    let error: Error | null = null;

    onMount(() => {
        window.addEventListener('error', handleError);
        window.addEventListener('unhandledrejection', handleRejection);
        return () => {
            window.removeEventListener('error', handleError);
            window.removeEventListener('unhandledrejection', handleRejection);
        };
    });

    function handleError(event: ErrorEvent) {
        error = event.error;
        logError(error, 'ErrorBoundary');
    }

    function handleRejection(event: PromiseRejectionEvent) {
        error = event.reason;
        logError(error, 'ErrorBoundary');
    }
</script>

{#if error}
    <div class="error-boundary" role="alert">
        <h2>Error</h2>
        <p>{fallback}</p>
        {#if import.meta.env.DEV}
            <pre class="error-details">{error.message}</pre>
        {/if}
    </div>
{:else}
    <slot />
{/if}

<style>
    .error-boundary {
        padding: 1rem;
        margin: 1rem;
        border: 1px solid #ff4444;
        border-radius: 4px;
        background-color: #fff5f5;
    }

    .error-details {
        margin-top: 1rem;
        padding: 0.5rem;
        background-color: #f8f8f8;
        border-radius: 4px;
        font-family: monospace;
        font-size: 0.875rem;
        white-space: pre-wrap;
    }
</style> 
