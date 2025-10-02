<script lang="ts">
	import type { Goal, UserStats } from '$lib/server/api/types';
	import PredictionChart from './charts/PredictionChart.svelte';
	import type { ChartDataPoint } from './charts/types.js';
	import { transformPredictionDataCached, sampleDataPoints } from './charts/utils.js';
	import { timeAsync } from '$lib/utils/performance.js';
	
	let { goal, userStats }: { goal: Goal; userStats: UserStats } = $props();
	let timeProgressValue = $state(0);
	let trackingError = $state<string | null>(null);
	let isTracking = $state(false);
	let trackingRetryCount = $state(0);
	let maxRetries = 3;
	
	// Chart-related state
	let chartData = $state<ChartDataPoint[]>([]);
	let chartLoading = $state(false);
	let chartError = $state<string | null>(null);
	let chartRetryCount = $state(0);
	let databaseUnavailable = $state(false);
	
	// Client-side caching
	let chartDataCache = $state<{
		data: ChartDataPoint[];
		timestamp: number;
		userId: number | null;
	} | null>(null);
	let cacheExpiryMs = 5 * 60 * 1000; // 5 minutes cache
	
	// Component state
	let componentError = $state<string | null>(null);
	let isInitialized = $state(false);
	
	const today = new Date();
	const endDate = new Date(goal.end_date);

	// Calculate weeks remaining (full weeks only)
	const msPerWeek = 7 * 24 * 60 * 60 * 1000;
	const weeksRemaining = Math.floor((endDate.getTime() - today.getTime()) / msPerWeek);

	// Store previous prediction values for change detection
	let previousPredictions = $state<{
		time: string | null;
		pace: string | null;
	}>({ time: null, pace: null });

	// Function to calculate progress
	function calculateProgress() {
		if (goal && goal.start_date && goal.end_date) {
			const startDate = new Date(goal.start_date);

			const totalDays = (endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24);
			const daysPassed = (today.getTime() - startDate.getTime()) / (1000 * 3600 * 24);
			timeProgressValue = Math.min(Math.max((daysPassed / totalDays) * 100, 0), 100);
		}
	}

	// Function to check if cached data is still valid
	function isCacheValid(userId: number): boolean {
		if (!chartDataCache) return false;
		if (chartDataCache.userId !== userId) return false;
		
		const now = Date.now();
		const cacheAge = now - chartDataCache.timestamp;
		return cacheAge < cacheExpiryMs;
	}

	// Function to load prediction history for chart
	async function loadPredictionHistory(forceRefresh = false) {
		// Only load if we have a valid goal
		if (!goal) {
			if (!isInitialized) {
				chartError = 'No active goal found';
				chartData = [];
			}
			return;
		}

		// Check cache first (unless force refresh)
		if (!forceRefresh && chartDataCache && isCacheValid(chartDataCache.userId || 0)) {
			chartData = chartDataCache.data;
			chartError = null;
			chartLoading = false;
			return;
		}

		try {
			chartLoading = true;
			chartError = null;
			databaseUnavailable = false;

			// Add query parameters for optimized data loading
			const params = new URLSearchParams();
			if (goal.start_date) {
				params.append('start_date', goal.start_date);
			}
			// Limit to recent data for better performance
			params.append('limit', '100');

			const response = await timeAsync('api-request', async () => {
				return fetch(`/api/v0/prediction-history?${params}`, {
					method: 'GET',
					headers: {
						'Content-Type': 'application/json'
					}
				});
			}, { operation: 'load-prediction-history', forceRefresh });

			if (!response.ok) {
				const errorData = await response.json();
				
				// Handle specific error cases
				if (response.status === 503 && errorData.code === 'DATABASE_UNAVAILABLE') {
					databaseUnavailable = true;
					chartError = 'Prediction tracking is temporarily unavailable';
					// Use fallback data if provided
					if (errorData.fallback && errorData.records) {
						chartData = transformPredictionDataCached(errorData.records);
					} else {
						chartData = [];
					}
					return;
				}
				
				if (response.status === 401) {
					chartError = 'Authentication required to load prediction history';
					chartData = [];
					return;
				}
				
				throw new Error(errorData.error || `Server error: ${response.status}`);
			}

			const result = await response.json();
			
			// Reset retry count on successful load
			chartRetryCount = 0;
			
			// Transform the data for chart display
			if (result.records && Array.isArray(result.records)) {
				const startTime = performance.now();
				let transformedData = transformPredictionDataCached(result.records);
				const duration = performance.now() - startTime;
				
				// Log performance in development
				if (import.meta.env.DEV && duration > 50) {
					console.warn(`Data transformation took ${duration.toFixed(2)}ms`, { 
						recordCount: result.records.length 
					});
				}
				
				// Sample data for better performance with large datasets
				if (transformedData.length > 100) {
					transformedData = sampleDataPoints(transformedData, 100);
				}
				
				chartData = transformedData;
				
				// Update cache with fresh data
				chartDataCache = {
					data: chartData,
					timestamp: Date.now(),
					userId: result.user_id || 0 // Assume API returns user_id
				};
				
				// Show helpful message if no data exists yet
				if (result.records.length === 0) {
					chartError = null; // Clear any previous errors
				}
			} else {
				chartData = [];
			}

		} catch (error) {
			console.error('Failed to load prediction history:', error);
			
			// Implement retry logic for network errors
			if (chartRetryCount < maxRetries && 
				(error instanceof TypeError || // Network error
				 (error instanceof Error && error.message.includes('fetch')))) {
				
				chartRetryCount++;
				console.log(`Retrying chart data load (attempt ${chartRetryCount}/${maxRetries})`);
				
				// Retry after a delay
				setTimeout(() => {
					loadPredictionHistory();
				}, 1000 * chartRetryCount); // Exponential backoff
				
				chartError = `Loading prediction history... (attempt ${chartRetryCount}/${maxRetries})`;
				return;
			}
			
			// Set user-friendly error message
			if (error instanceof Error) {
				if (error.message.includes('fetch')) {
					chartError = 'Unable to connect to server. Please check your internet connection.';
				} else if (error.message.includes('Authentication')) {
					chartError = 'Please log in to view prediction history';
				} else {
					chartError = 'Unable to load prediction history';
				}
			} else {
				chartError = 'Unable to load prediction history';
			}
			
			chartData = [];
		} finally {
			chartLoading = false;
		}
	}

	// Function to track prediction changes
	async function trackPredictionChanges() {
		// Only track if we have valid goal and user stats
		if (!goal) {
			if (!isInitialized) {
				trackingError = 'No active goal to track predictions for';
			}
			return;
		}

		if (!userStats?.best_times?.time_for_goal || !userStats?.best_times?.pace_for_goal) {
			if (!isInitialized) {
				trackingError = 'No prediction data available to track';
			}
			return;
		}

		const currentTime = userStats.best_times.time_for_goal;
		const currentPace = userStats.best_times.pace_for_goal;

		// Check if values have changed from previous tracking
		if (previousPredictions.time === currentTime && previousPredictions.pace === currentPace) {
			return; // No changes detected
		}

		// Handle first load - we need to check if there's existing data first
		const isFirstLoad = previousPredictions.time === null && previousPredictions.pace === null;
		
		if (isFirstLoad) {
			console.log('First load - checking for existing data and storing initial prediction:', { currentTime, currentPace });
			// We'll store this prediction and let the API handle deduplication
		}

		try {
			isTracking = true;
			trackingError = null;

			console.log('Tracking prediction changes:', {
				currentTime,
				currentPace,
				previousTime: previousPredictions.time,
				previousPace: previousPredictions.pace,
				isFirstLoad
			});

			const response = await fetch('/api/v0/prediction-history', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					predicted_time: currentTime,
					predicted_pace: currentPace
				})
			});

			if (!response.ok) {
				let errorData;
				try {
					errorData = await response.json();
				} catch (parseError) {
					console.error('Failed to parse error response:', parseError);
					throw new Error(`Server error: ${response.status} ${response.statusText}`);
				}
				
				console.error('API error response:', {
					status: response.status,
					statusText: response.statusText,
					errorData
				});
				
				// Handle specific error cases
				if (response.status === 503 && errorData.code === 'DATABASE_UNAVAILABLE') {
					trackingError = 'Prediction tracking is temporarily unavailable';
					// Don't update previous values so we can retry later
					return;
				}
				
				if (response.status === 401) {
					// Don't show error for authentication issues - this is expected for logged-out users
					console.log('User not authenticated for prediction tracking');
					trackingError = null; // Clear any previous errors
					return;
				}
				
				throw new Error(errorData.error || `Server error: ${response.status} - ${errorData.code || 'Unknown'}`);
			}

			const result = await response.json();
			
			console.log('Prediction tracking response:', {
				status: response.status,
				result,
				stored: result.stored
			});
			
			// Reset retry count on successful tracking
			trackingRetryCount = 0;
			
			// Update previous values only after successful tracking
			previousPredictions.time = currentTime;
			previousPredictions.pace = currentPace;

			// Reload chart data if new data was stored
			if (result.stored) {
				console.log('Prediction changes tracked successfully - reloading chart data');
				// Force refresh to get the latest data and update cache
				await loadPredictionHistory(true);
			} else {
				console.log('No new data stored (values unchanged or first load)');
			}

		} catch (error) {
			console.error('Failed to track prediction changes:', error);
			console.error('Error type:', typeof error);
			console.error('Error constructor:', error?.constructor?.name);
			
			// Implement retry logic for network errors
			if (trackingRetryCount < maxRetries && 
				(error instanceof TypeError || // Network error
				 (error instanceof Error && error.message.includes('fetch')))) {
				
				trackingRetryCount++;
				console.log(`Retrying prediction tracking (attempt ${trackingRetryCount}/${maxRetries})`);
				
				// Retry after a delay
				setTimeout(() => {
					trackPredictionChanges();
				}, 2000 * trackingRetryCount); // Exponential backoff
				
				trackingError = `Retrying prediction tracking... (attempt ${trackingRetryCount}/${maxRetries})`;
				return;
			}
			
			// Set user-friendly error message
			if (error instanceof Error) {
				console.error('Prediction tracking error details:', {
					message: error.message,
					stack: error.stack,
					name: error.name
				});
				
				if (error.message.includes('fetch')) {
					trackingError = 'Unable to connect to server for prediction tracking';
				} else if (error.message.includes('Authentication') || error.message.includes('401')) {
					// Don't show error for authentication issues
					console.log('Authentication required for prediction tracking');
					trackingError = null;
				} else if (error.message.includes('Server error: 401')) {
					// Handle 401 errors gracefully
					console.log('User not authenticated for prediction tracking');
					trackingError = null;
				} else {
					// Only show error if it's not authentication-related
					if (!error.message.includes('401') && !error.message.toLowerCase().includes('auth')) {
						trackingError = `Unable to track prediction changes: ${error.message}`;
					} else {
						console.log('Suppressing authentication-related error:', error.message);
						trackingError = null;
					}
				}
			} else {
				console.error('Non-Error object thrown:', error);
				trackingError = 'Unable to track prediction changes';
			}
		} finally {
			isTracking = false;
		}
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
			loadPredictionHistory();
			
			isInitialized = true;
		} catch (error) {
			console.error('Error initializing goal component:', error);
			componentError = 'Failed to initialize goal tracking';
			isInitialized = true;
		}
	});

	// Function to retry failed operations
	function retryOperations() {
		chartRetryCount = 0;
		trackingRetryCount = 0;
		chartError = null;
		trackingError = null;
		componentError = null;
		databaseUnavailable = false;
		
		// Retry loading data
		loadPredictionHistory();
		trackPredictionChanges();
	}
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
			{#if databaseUnavailable}
				<div class="alert alert-warning mt-2">
					<div>
						<span class="text-sm">⚠️ Prediction tracking is temporarily unavailable. Your progress will be tracked once the service is restored.</span>
						<button class="btn btn-sm btn-outline ml-2" onclick={retryOperations}>
							Retry
						</button>
					</div>
				</div>
			{:else if isTracking}
				<div class="text-sm text-blue-500 mt-2 flex items-center">
					<span class="loading loading-spinner loading-xs mr-2"></span>
					Tracking prediction changes...
				</div>
			{:else if trackingError}
				<div class="alert alert-error mt-2">
					<div class="flex justify-between items-center">
						<span class="text-sm">⚠️ {trackingError}</span>
						{#if trackingRetryCount < maxRetries}
							<button class="btn btn-sm btn-outline" onclick={retryOperations}>
								Retry
							</button>
						{/if}
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
				loading={chartLoading} 
				error={chartError}
				goalStartDate={goal.start_date}
				goalEndDate={goal.end_date}
			/>
			
			{#if chartError && !chartLoading}
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
				loading={chartLoading} 
				error={chartError}
				goalStartDate={goal.start_date}
				goalEndDate={goal.end_date}
			/>
			
			{#if chartError && !chartLoading}
				<div class="mt-2 text-center">
					<button class="btn btn-sm btn-outline" onclick={retryOperations}>
						Retry Loading Chart
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
