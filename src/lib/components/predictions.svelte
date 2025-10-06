<script lang="ts">
	import type { UserStats } from '$lib/server/api/types';
	import { usePredictionsData } from '$lib/utils/data-fetching.js';
	import Loading from './loading.svelte';
	
	// Accept userStats as props for backward compatibility, but also support standalone usage
	let { userStats }: { userStats?: UserStats } = $props();
	
	// Use standardized data fetching if no userStats provided
	const predictionsData = userStats ? null : usePredictionsData();
	
	// Subscribe to store state
	let predictionsState = $state<any>();
	
	$effect(() => {
		if (predictionsData) {
			const unsubscribe = predictionsData.subscribe((state) => {
				predictionsState = state;
			});
			
			return unsubscribe;
		}
	});
	
	// Determine which data source to use
	let predictions = $derived.by(() => {
		if (userStats?.best_times) {
			return userStats.best_times;
		}
		return predictionsState?.data || null;
	});
	
	let isLoading = $derived(predictionsState?.loading || false);
	let error = $derived.by(() => {
		if (!predictionsState?.error) return null;
		
		if (predictionsState.error.code === 'AUTHENTICATION_REQUIRED') {
			return 'Please log in to view your race predictions';
		}
		
		return 'Unable to load race predictions';
	});
	
	// Initialize data loading if using standalone mode
	$effect(() => {
		if (!userStats && predictionsData) {
			predictionsData.load();
		}
	});
	
	function retryLoading() {
		if (predictionsData) {
			predictionsData.reload();
		}
	}
</script>

<div class="card dark:bg-gray-700 bg-gray-50 shadow-lg max-w-4xl w-full">
    <div class="card-body">
        <h2 class="card-title">Race predictions</h2>
        
        {#if isLoading}
			<div class="flex justify-center items-center py-8">
				<Loading />
			</div>
		{:else if error}
			<div class="alert alert-error">
				<div>
					<span class="text-sm">{error}</span>
				</div>
			</div>
			<button class="btn btn-primary mt-4" onclick={retryLoading}>
				Retry
			</button>
		{:else if !predictions}
			<div class="alert alert-info">
				<div>
					<span class="text-sm">No prediction data available yet. Complete some training to see your race predictions.</span>
				</div>
			</div>
		{:else}
			<table class="table w-full">
				<thead>
					<tr>
						<th>Distance</th>
						<th>Time</th>
						<th>Pace</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>5km</td>
						<td>{predictions.time_for_5 ? predictions.time_for_5 + 'h' : 'N/A'}</td>
						<td>{predictions.pace_for_5 || 'N/A'}</td>
					</tr>
					<tr>
						<td>10km</td>
						<td>{predictions.time_for_10 ? predictions.time_for_10 + 'h' : 'N/A'}</td>
						<td>{predictions.pace_for_10 || 'N/A'}</td>
					</tr>
					<tr>
						<td>21km</td>
						<td>{predictions.time_for_half_marathon ? predictions.time_for_half_marathon + 'h' : 'N/A'}</td>
						<td>{predictions.pace_for_half_marathon || 'N/A'}</td>
					</tr>
					<tr>
						<td>42km</td>
						<td>{predictions.time_for_marathon ? predictions.time_for_marathon + 'h' : 'N/A'}</td>
						<td>{predictions.pace_for_marathon || 'N/A'}</td>
					</tr>
				</tbody>
			</table>
		{/if}
    </div>
</div>
