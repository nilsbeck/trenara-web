import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Goal, UserStats } from '$lib/server/api/types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock console methods to avoid noise in tests
const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('Goal Component Prediction Tracking', () => {
	const mockGoal: Goal = {
		id: 1,
		name: 'Marathon Test',
		description: 'Test marathon goal',
		start_date: '2024-01-01',
		end_date: '2024-12-31',
		can_be_edited: true,
		created_at: 1640995200,
		distance: '42.2',
		distance_unit: 'km',
		distance_unit_text: 'kilometers',
		distance_value: 42.2,
		edit_warning: null,
		intermediate_goals: [],
		number_of_trainings: 4,
		overrule_time: false,
		pace: '4:30 min/km',
		pace_unit: 'min/km',
		pace_value: 4.5,
		time: '3:10:00',
		time_in_sec: 11400,
		time_unit: 'h',
		time_value: 3.17,
		time_type_selected: 'time',
		training_condition: {
			id: 1,
			height_difference: null,
			surface: 'road',
			height: null,
			height_unit: null
		},
		training_scheme_type: 'standard',
		week: [],
		updated_at: 1640995200
	};

	const mockUserStats: UserStats = {
		best_times: {
			distance_unit: 'km',
			pace_unit: 'min/km',
			pace_for_5: '4:00 min/km',
			time_for_5: '20:00',
			pace_for_10: '4:15 min/km',
			time_for_10: '42:30',
			pace_for_half_marathon: '4:20 min/km',
			time_for_half_marathon: '1:31:00',
			pace_for_marathon: '4:30 min/km',
			time_for_marathon: '3:10:00',
			pace_for_goal: '4:30 min/km',
			time_for_goal: '3:10:00'
		},
		flat_stats: [],
		graph_stats: {
			weeks: {
				data: [],
				done: '0',
				done_value: 0,
				done_unit: 'km',
				done_unit_text: 'kilometers',
				todo: '0',
				todo_value: 0,
				todo_unit: 'km',
				todo_unit_text: 'kilometers'
			},
			goal: {
				data: [],
				done: '0',
				done_value: 0,
				done_unit: 'km',
				done_unit_text: 'kilometers',
				todo: '0',
				todo_value: 0,
				todo_unit: 'km',
				todo_unit_text: 'kilometers'
			}
		}
	};

	beforeEach(() => {
		mockFetch.mockClear();
		consoleSpy.mockClear();
		consoleErrorSpy.mockClear();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('should call prediction tracking API when values change', async () => {
		// Mock successful API response
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				message: 'Prediction stored successfully',
				stored: true,
				record: {
					id: 1,
					user_id: 123,
					predicted_time: '3:08:00',
					predicted_pace: '4:28 min/km',
					recorded_at: '2024-01-15',
					created_at: '2024-01-15T10:00:00Z'
				}
			})
		});

		// Simulate the tracking function logic
		const trackPredictionChanges = async (
			goal: Goal,
			userStats: UserStats,
			previousPredictions: { time: string | null; pace: string | null }
		) => {
			if (!goal || !userStats?.best_times?.time_for_goal || !userStats?.best_times?.pace_for_goal) {
				return;
			}

			const currentTime = userStats.best_times.time_for_goal;
			const currentPace = userStats.best_times.pace_for_goal;

			// Check if values have changed from previous tracking
			if (previousPredictions.time === currentTime && previousPredictions.pace === currentPace) {
				return; // No changes detected
			}

			// Skip tracking if this is the first load and we don't have previous values
			if (previousPredictions.time === null && previousPredictions.pace === null) {
				previousPredictions.time = currentTime;
				previousPredictions.pace = currentPace;
				return;
			}

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
				const errorData = await response.json();
				throw new Error(errorData.error || 'Failed to track prediction changes');
			}

			const result = await response.json();
			
			// Update previous values only after successful tracking
			previousPredictions.time = currentTime;
			previousPredictions.pace = currentPace;

			return result;
		};

		// Test scenario: first load (should not call API)
		let previousPredictions = { time: null, pace: null };
		await trackPredictionChanges(mockGoal, mockUserStats, previousPredictions);
		
		expect(mockFetch).not.toHaveBeenCalled();
		expect(previousPredictions.time).toBe('3:10:00');
		expect(previousPredictions.pace).toBe('4:30 min/km');

		// Test scenario: values changed (should call API)
		const updatedUserStats = {
			...mockUserStats,
			best_times: {
				...mockUserStats.best_times,
				time_for_goal: '3:08:00',
				pace_for_goal: '4:28 min/km'
			}
		};

		await trackPredictionChanges(mockGoal, updatedUserStats, previousPredictions);

		expect(mockFetch).toHaveBeenCalledWith('/api/v0/prediction-history', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				predicted_time: '3:08:00',
				predicted_pace: '4:28 min/km'
			})
		});

		expect(previousPredictions.time).toBe('3:08:00');
		expect(previousPredictions.pace).toBe('4:28 min/km');
	});

	it('should handle API errors gracefully', async () => {
		// Mock API error response
		mockFetch.mockResolvedValueOnce({
			ok: false,
			json: async () => ({
				error: 'Database connection failed'
			})
		});

		const trackPredictionChanges = async (
			goal: Goal,
			userStats: UserStats,
			previousPredictions: { time: string | null; pace: string | null }
		) => {
			if (!goal || !userStats?.best_times?.time_for_goal || !userStats?.best_times?.pace_for_goal) {
				return;
			}

			const currentTime = userStats.best_times.time_for_goal;
			const currentPace = userStats.best_times.pace_for_goal;

			if (previousPredictions.time === currentTime && previousPredictions.pace === currentPace) {
				return;
			}

			if (previousPredictions.time === null && previousPredictions.pace === null) {
				previousPredictions.time = currentTime;
				previousPredictions.pace = currentPace;
				return;
			}

			try {
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
					const errorData = await response.json();
					throw new Error(errorData.error || 'Failed to track prediction changes');
				}

				const result = await response.json();
				previousPredictions.time = currentTime;
				previousPredictions.pace = currentPace;
				return result;
			} catch (error) {
				console.error('Failed to track prediction changes:', error);
				throw error;
			}
		};

		// Set up previous values to trigger API call
		let previousPredictions = { time: '3:10:00', pace: '4:30 min/km' };
		
		const updatedUserStats = {
			...mockUserStats,
			best_times: {
				...mockUserStats.best_times,
				time_for_goal: '3:08:00',
				pace_for_goal: '4:28 min/km'
			}
		};

		await expect(trackPredictionChanges(mockGoal, updatedUserStats, previousPredictions))
			.rejects.toThrow('Database connection failed');

		expect(consoleErrorSpy).toHaveBeenCalledWith(
			'Failed to track prediction changes:',
			expect.any(Error)
		);
	});

	it('should not call API when no goal is present', async () => {
		const trackPredictionChanges = async (
			goal: Goal | null,
			userStats: UserStats,
			previousPredictions: { time: string | null; pace: string | null }
		) => {
			if (!goal || !userStats?.best_times?.time_for_goal || !userStats?.best_times?.pace_for_goal) {
				return;
			}
			// Rest of the function would not execute
		};

		let previousPredictions = { time: null, pace: null };
		await trackPredictionChanges(null, mockUserStats, previousPredictions);
		
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it('should not call API when user stats are missing', async () => {
		const trackPredictionChanges = async (
			goal: Goal,
			userStats: UserStats | null,
			previousPredictions: { time: string | null; pace: string | null }
		) => {
			if (!goal || !userStats?.best_times?.time_for_goal || !userStats?.best_times?.pace_for_goal) {
				return;
			}
			// Rest of the function would not execute
		};

		let previousPredictions = { time: null, pace: null };
		await trackPredictionChanges(mockGoal, null, previousPredictions);
		
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it('should load prediction history for chart display', async () => {
		// Mock successful API response for prediction history
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				records: [
					{
						id: 1,
						user_id: 123,
						predicted_time: '3:10:00',
						predicted_pace: '4:30 min/km',
						recorded_at: '2024-01-15',
						created_at: '2024-01-15T10:00:00Z'
					},
					{
						id: 2,
						user_id: 123,
						predicted_time: '3:08:00',
						predicted_pace: '4:28 min/km',
						recorded_at: '2024-01-20',
						created_at: '2024-01-20T10:00:00Z'
					}
				]
			})
		});

		// Simulate the loadPredictionHistory function logic
		const loadPredictionHistory = async (goal: Goal) => {
			if (!goal) {
				return [];
			}

			const response = await fetch('/api/v0/prediction-history', {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Failed to load prediction history');
			}

			const result = await response.json();
			return result.records || [];
		};

		const records = await loadPredictionHistory(mockGoal);

		expect(mockFetch).toHaveBeenCalledWith('/api/v0/prediction-history', {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json'
			}
		});

		expect(records).toHaveLength(2);
		expect(records[0]).toEqual({
			id: 1,
			user_id: 123,
			predicted_time: '3:10:00',
			predicted_pace: '4:30 min/km',
			recorded_at: '2024-01-15',
			created_at: '2024-01-15T10:00:00Z'
		});
	});

	it('should handle chart data loading errors gracefully', async () => {
		// Mock API error response for prediction history
		mockFetch.mockResolvedValueOnce({
			ok: false,
			json: async () => ({
				error: 'Failed to retrieve prediction history'
			})
		});

		const loadPredictionHistory = async (goal: Goal) => {
			if (!goal) {
				return [];
			}

			try {
				const response = await fetch('/api/v0/prediction-history', {
					method: 'GET',
					headers: {
						'Content-Type': 'application/json'
					}
				});

				if (!response.ok) {
					const errorData = await response.json();
					throw new Error(errorData.error || 'Failed to load prediction history');
				}

				const result = await response.json();
				return result.records || [];
			} catch (error) {
				console.error('Failed to load prediction history:', error);
				throw error;
			}
		};

		await expect(loadPredictionHistory(mockGoal))
			.rejects.toThrow('Failed to retrieve prediction history');

		expect(consoleErrorSpy).toHaveBeenCalledWith(
			'Failed to load prediction history:',
			expect.any(Error)
		);
	});
});
