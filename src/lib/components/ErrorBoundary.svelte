<script lang="ts">
	import { createErrorBoundary } from '$lib/utils/error-boundary.js';
	import { errorStore } from '$lib/stores/error.store.js';

	let { children, fallback, onError, retryFn } = $props<{
		children: any;
		fallback?: any;
		onError?: (error: Error) => void;
		retryFn?: () => Promise<void>;
	}>();

	const errorBoundary = createErrorBoundary(retryFn);

	// Watch for errors and handle them
	$effect(() => {
		if (errorBoundary.error) {
			// Add to global error store
			errorStore.addError(errorBoundary.error);

			// Call custom error handler if provided
			if (onError) {
				onError(errorBoundary.error);
			}
		}
	});

	// Expose error boundary methods to parent
	export function handleError(error: Error) {
		errorBoundary.handleError(error);
	}

	export function clearError() {
		errorBoundary.clearError();
	}

	export function retry() {
		return errorBoundary.retry?.();
	}
</script>

{#if errorBoundary.hasError}
	{#if fallback}
		{@render fallback(errorBoundary.error, errorBoundary.retry)}
	{:else}
		<div class="error-boundary">
			<div class="error-content">
				<h3>Something went wrong</h3>
				<p>{errorBoundary.error?.message || 'An unexpected error occurred'}</p>
				{#if errorBoundary.retry}
					<button class="btn btn-primary" onclick={() => errorBoundary.retry?.()}>
						Try Again
					</button>
				{/if}
				<button class="btn btn-outline" onclick={() => errorBoundary.clearError()}>
					Dismiss
				</button>
			</div>
		</div>
	{/if}
{:else}
	{@render children()}
{/if}

<style>
	.error-boundary {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 200px;
		padding: 2rem;
		border: 1px solid #ef4444;
		border-radius: 0.5rem;
		background-color: #fef2f2;
	}

	.error-content {
		text-align: center;
		max-width: 400px;
	}

	.error-content h3 {
		color: #dc2626;
		margin-bottom: 0.5rem;
	}

	.error-content p {
		color: #7f1d1d;
		margin-bottom: 1rem;
	}

	.error-content button {
		margin: 0 0.5rem;
	}

	/* Dark mode support */
	:global(.dark) .error-boundary {
		background-color: #450a0a;
		border-color: #dc2626;
	}

	:global(.dark) .error-content h3 {
		color: #f87171;
	}

	:global(.dark) .error-content p {
		color: #fca5a5;
	}
</style>
