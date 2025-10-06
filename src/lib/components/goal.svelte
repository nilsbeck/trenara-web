<script lang="ts">
	import type { Goal, UserStats } from '$lib/server/api/types';
	import PredictionChart from './charts/PredictionChart.svelte';
	import type { ChartDataPoint } from './charts/types.js';
	import { transformPredictionDataCached, sampleDataPoints } from './charts/utils.js';
	import { usePredictionHistoryData, usePredictionTracking } from '$lib/utils/data-fetching.js';
	
	let { goal, userStats }: { goal: Goal; userStats: UserStats } = $props();
	
	// Component state
	let timeProgressValue = $state(0);
	let isInitialized = $state(false);
	let componentError = $state<string | null>(null);
	
	// Chart data state
	let chartData = $state<ChartDataPoint[]>([]);
	
	// Store previous prediction values for change detection
	let previousPredictions = $state<{
		time: string | null;
		pace: string | null;
	}>({ time: null, pace: null });

	const today = new Date();
	const endDate = new Date(goal.end_date);

	// Calculate weeks remaining (full weeks only)
	const msPerWeek = 7 * 24 * 60 * 60 * 1000;
	const weeksRemaining = Math.floor((endDate.getTime() - today.getTime()) / msPerWeek);

	// Use standardized data fetching for prediction history
	const predictionHistory = usePredictionHistoryData(goal?.start_date, 100);
	
	// Use standardized prediction tracking
	const predictionTracking = usePredictionTracking();
	
	// Subscribe to store states
	let predictionHistoryState = $state<any>();
	let predictionTrackingState = $state<any>();
	
	$effect(() => {
		const unsubscribe1 = predictionHistory.subscribe((state) => {
			predictionHistoryState = state;
		});
		
		const unsubscribe2 = predictionTracking.subscribe((state) => {
			predictionTrackingState = state;
		});
		
		return () => {
			unsubscribe1();
			unsubscribe2();
		};
	});

	// Function to calculate progress
	function calculateProgress() {
		if (goal && goal.start_date && goal.end_date) {
			const startDate = new Date(goal.start_date);
			const totalDays = (endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24);
			const daysPassed = (today.getTime() - startDate.getTime()) / (1000 * 3600 * 24);
			timeProgressValue = Math.min(Math.max((daysPassed / totalDays) * 100, 0), 100);
		}
	}

	// Function to process chart data from prediction history
	function processChartData(historyData: any) {
		if (!historyData?.records || !Array.isArray(historyData.records)) {
			return [];
		}

		let transformedData = transformPredictionDataCached(historyData.records);
		
		// Sample data for better performance with large datasets
		if (transformedData.length > 100) {
			transformedData = sampleDataPoints(transformedData, 100);
		}
		
		return transformedData;
	}

	// Function to track prediction changes
	async function trackPredictionChanges() {
		// Only track if we have valid goal and user stats
		if (!goal || !userStats?.best_times?.time_for_goal || !userStats?.best_times?.pace_for_goal) {
			return;
		}

		const currentTime = userStats.best_times.time_for_goal;
		const currentPace = userStats.best_times.pace_for_goal;

		// Check if values have changed from previous tracking
		if (previousPredictions.time === currentTime && previousPredictions.pace === currentPace) {
			return; // No changes detected
		}

		try {
			const result = await predictionTracking.trackPrediction(currentTime, currentPace);
			
			// Update previous values only after successful tracking
			previousPredictions.time = currentTime;
			previousPredictions.pace = currentPace;

			// Reload chart data if new data was stored
			if (result?.stored) {
				console.log('Prediction changes tracked successfully - reloading chart data');
				await predictionHistory.reload();
			}
		} catch (error) {
			console.error('Failed to track prediction changes:', error);
			// Error is handled by the tracking hook
		}
	}

	// Function to retry failed operations
	function retryOperations() {
		predictionTracking.clearError();
		componentError = null;
		
		// Retry loading data
		predictionHistory.reload();
		trackPredictionChanges();
	}

	// Initialize component and handle errors
	$effect(() => {
		try {
			componentError = null;
			
			// Validate that we have the required data
			if (!goal) {
				componentError = 'No active goal found';
				isInitialized = true;
				return;
			}
			
			if (!userStats) {
				componentError = 'User statistics not available';
				isInitialized = true;
				return;
			}
			
			// Initialize the component
			calculateProgress();
			trackPredictionChanges();
			predictionHistory.load();
			
			isInitialized = true;
		} catch (error) {
			console.error('Error initializing goal component:', error);
			componentError = 'Failed to initialize goal tracking';
			isInitialized = true;
		}
	});

	// Update chart data when prediction history changes
	$effect(() => {
		if (predictionHistoryState?.data) {
			chartData = processChartData(predictionHistoryState.data);
		} else if (predictionHistoryState?.error?.code === 'DATABASE_UNAVAILABLE' && predictionHistoryState.error.records) {
			// Use fallback data if available
			chartData = processChartData({ records: predictionHistoryState.error.records });
		} else {
			chartData = [];
		}
	});

	// Derived states for better readability
	let isDatabaseUnavailable = $derived(
		predictionHistoryState?.error?.code === 'DATABASE_UNAVAILABLE' || 
		predictionTrackingState?.error?.code === 'DATABASE_UNAVAILABLE'
	);
	
	let chartError = $derived.by(() => {
		if (!predictionHistoryState?.error) return null;
		
		if (predictionHistoryState.error.code === 'DATABASE_UNAVAILABLE') {
			return 'Prediction tracking is temporarily unavailable';
		}
		
		if (predictionHistoryState.error.code === 'AUTHENTICATION_REQUIRED') {
			return null; // Don't show auth errors to user
		}
		
		return 'Unable to load prediction history';
	});
	
	let trackingError = $derived.by(() => {
		if (!predictionTrackingState?.error) return null;
		
		if (predictionTrackingState.error.code === 'DATABASE_UNAVAILABLE') {
			return 'Prediction tracking is temporarily unavailable';
		}
		
		return 'Unable to track prediction changes';
	});
</script>

{#if componentError}
	<div class="card dark:bg-gray-700 bg-gray-50 shadow-lg max-w-4xl w-full">
		<div class="card-body">
			<h2 class="card-title text-red-600">Goal Tracking Error</h2>
			<div class="alert alert-error">
				<div>
					<span class="text-sm">{componentError}</span>
				</div>
			</div>
			<button class="btn btn-primary mt-4" onclick={retryOperations}>
				Retry
			</button>
		</div>
	</div>
{:else if !goal}
	<div class="card dark:bg-gray-700 bg-gray-50 shadow-lg max-w-sm w-full">
		<div class="card-body">
			<h2 class="card-title">Event</h2>
			<p>There is currently no goal set that we can track.</p>
			<div class="text-sm text-gray-500 mt-2">
				Set up a goal to start tracking your prediction progress over time.
			</div>
		</div>
	</div>
{:else if endDate > today}
	<div class="card dark:bg-gray-700 bg-gray-50 shadow-lg max-w-4xl w-full">
		<div class="card-body">
			<h2 class="card-title">Event: {goal.name} ({goal.distance})</h2>
			
			{#if !userStats?.best_times}
				<div class="alert alert-warning mb-4">
					<div>
						<span class="text-sm">No prediction data available yet. Complete some training to see your predictions.</span>
					</div>
				</div>
			{:else}
				<table class="table w-full">
					<thead>
						<tr>
							<th></th>
							<th>Goal</th>
							<th>Current Prediction</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>Pace</td>
							<td>{goal.pace}</td>
							<td>{userStats.best_times.pace_for_goal || 'N/A'}</td>
						</tr>
						<tr>
							<td>Time</td>
							<td>{goal.time}h</td>
							<td>{userStats.best_times.time_for_goal ? userStats.best_times.time_for_goal + 'h' : 'N/A'}</td>
						</tr>
					</tbody>
				</table>
			{/if}
			
			<p>Time to goal ({weeksRemaining} weeks left):</p>
			<progress
				class="progress progress-secondary w-full border border-light-gray"
				value={timeProgressValue}
				max="100"
			></progress>
			
			<!-- Status and error display -->
			{#if isDatabaseUnavailable}
				<div class="alert alert-warning mt-2">
					<div>
						<span class="text-sm">⚠️ Prediction tracking is temporarily unavailable. Your progress will be tracked once the service is restored.</span>
						<button class="btn btn-sm btn-outline ml-2" onclick={retryOperations}>
							Retry
						</button>
					</div>
				</div>
			{:else if predictionTrackingState?.isTracking}
				<div class="text-sm text-blue-500 mt-2 flex items-center">
					<span class="loading loading-spinner loading-xs mr-2"></span>
					Tracking prediction changes...
				</div>
			{:else if trackingError}
				<div class="alert alert-error mt-2">
					<div class="flex justify-between items-center">
						<span class="text-sm">⚠️ {trackingError}</span>
						<button class="btn btn-sm btn-outline" onclick={retryOperations}>
							Retry
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Prediction Chart Card -->
	<div class="card dark:bg-gray-700 bg-gray-50 shadow-lg max-w-4xl w-full mt-6">
		<div class="card-body">
			<h2 class="card-title">Prediction Progress</h2>
			<div class="text-sm text-gray-500 mb-4">
				Track how your race predictions change over time as you train
			</div>
			
			<PredictionChart 
				data={chartData} 
				loading={predictionHistoryState?.loading || false} 
				error={chartError}
				goalStartDate={goal.start_date}
				goalEndDate={goal.end_date}
			/>
			
			{#if chartError && !predictionHistoryState?.loading}
				<div class="mt-2 text-center">
					<button class="btn btn-sm btn-outline" onclick={retryOperations}>
						Retry Loading Chart
					</button>
				</div>
			{/if}
		</div>
	</div>
{:else}
	<div class="card dark:bg-gray-700 bg-gray-50 shadow-lg max-w-sm w-full">
		<div class="card-body">
			<h2 class="card-title">Event Completed</h2>
			<p>Your goal "{goal.name}" has ended on {new Date(goal.end_date).toLocaleDateString()}.</p>
			<div class="text-sm text-gray-500 mt-2">
				Historical prediction data is available in the chart below.
			</div>
		</div>
	</div>

	<!-- Prediction Chart Card for Completed Event -->
	<div class="card dark:bg-gray-700 bg-gray-50 shadow-lg max-w-sm w-full mt-6">
		<div class="card-body">
			<h2 class="card-title">Historical Prediction Progress</h2>
			<div class="text-sm text-gray-500 mb-4">
				Your prediction progress during training for {goal.name}
			</div>
			
			<PredictionChart 
				data={chartData} 
				loading={predictionHistoryState?.loading || false} 
				error={chartError}
				goalStartDate={goal.start_date}
				goalEndDate={goal.end_date}
			/>
			
			{#if chartError && !predictionHistoryState?.loading}
				<div class="mt-2 text-center">
					<button class="btn btn-sm btn-outline" onclick={retryOperations}>
						Retry Loading Chart
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
