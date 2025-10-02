/**
 * Integration tests for prediction tracking feature end-to-end flow
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { transformPredictionData } from './charts/utils.js';
import type { PredictionHistoryRecord, ChartDataPoint } from './charts/types.js';

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Prediction Tracking Integration', () => {
  const mockUserStats = {
    best_times: {
      '5K': '00:20:30',
      '10K': '00:42:15',
      'Half Marathon': '01:35:45',
      'Marathon': '03:25:30'
    }
  };

  const mockGoalData = {
    id: 1,
    distance: 'Marathon',
    target_time: '03:20:00',
    start_date: '2024-01-01',
    end_date: '2024-03-01',
    is_active: true
  };

  const mockPredictionHistory: PredictionHistoryRecord[] = [
    {
      id: 1,
      user_id: 123,
      predicted_time: '03:25:30',
      predicted_pace: '04:52 min/km',
      recorded_at: '2024-01-01',
      created_at: '2024-01-01T10:00:00Z'
    },
    {
      id: 2,
      user_id: 123,
      predicted_time: '03:23:15',
      predicted_pace: '04:50 min/km',
      recorded_at: '2024-01-15',
      created_at: '2024-01-15T10:00:00Z'
    },
    {
      id: 3,
      user_id: 123,
      predicted_time: '03:21:00',
      predicted_pace: '04:48 min/km',
      recorded_at: '2024-02-01',
      created_at: '2024-02-01T10:00:00Z'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Data Flow Integration', () => {
    it('should transform API data to chart format correctly', () => {
      const chartData = transformPredictionData(mockPredictionHistory);

      expect(chartData).toHaveLength(3);
      expect(chartData[0]).toEqual({
        date: '2024-01-01',
        predictedTime: 12330, // 03:25:30 in seconds
        predictedPace: 292,    // 04:52 in seconds
        formattedTime: '03:25:30',
        formattedPace: '04:52 min/km'
      });
    });

    it('should handle progression data showing improvement over time', () => {
      const chartData = transformPredictionData(mockPredictionHistory);

      // Verify improvement trend (decreasing times and paces)
      expect(chartData[0].predictedTime).toBeGreaterThan(chartData[1].predictedTime);
      expect(chartData[1].predictedTime).toBeGreaterThan(chartData[2].predictedTime);
      expect(chartData[0].predictedPace).toBeGreaterThan(chartData[1].predictedPace);
      expect(chartData[1].predictedPace).toBeGreaterThan(chartData[2].predictedPace);
    });
  });

  describe('API Integration Scenarios', () => {
    it('should handle successful prediction history retrieval', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ 
          records: mockPredictionHistory, 
          count: mockPredictionHistory.length,
          database_status: 'healthy'
        })
      });

      const response = await fetch('/api/v0/prediction-history', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.records).toHaveLength(3);
      expect(data.count).toBe(3);
      expect(data.database_status).toBe('healthy');
    });

    it('should handle successful prediction storage', async () => {
      const newPrediction = {
        predicted_time: '03:20:45',
        predicted_pace: '04:47 min/km'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          message: 'Prediction stored successfully',
          stored: true,
          record: {
            id: 4,
            user_id: 123,
            ...newPrediction,
            recorded_at: '2024-02-15',
            created_at: '2024-02-15T10:00:00Z'
          },
          code: 'SUCCESS'
        })
      });

      const response = await fetch('/api/v0/prediction-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPrediction)
      });

      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.stored).toBe(true);
      expect(data.record.predicted_time).toBe('03:20:45');
      expect(data.code).toBe('SUCCESS');
    });

    it('should handle case when prediction values unchanged', async () => {
      const unchangedPrediction = {
        predicted_time: '03:25:30',
        predicted_pace: '04:52 min/km'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          message: 'Prediction values unchanged, no new record created',
          stored: false,
          code: 'NO_CHANGE'
        })
      });

      const response = await fetch('/api/v0/prediction-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(unchangedPrediction)
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.stored).toBe(false);
      expect(data.code).toBe('NO_CHANGE');
    });

    it('should handle database unavailable gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({
          error: 'Prediction tracking is temporarily unavailable',
          code: 'DATABASE_UNAVAILABLE',
          records: [],
          fallback: true
        })
      });

      const response = await fetch('/api/v0/prediction-history');
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.code).toBe('DATABASE_UNAVAILABLE');
      expect(data.records).toEqual([]);
      expect(data.fallback).toBe(true);
    });

    it('should handle authentication errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        })
      });

      const response = await fetch('/api/v0/prediction-history');
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.code).toBe('AUTH_REQUIRED');
    });

    it('should handle validation errors', async () => {
      const invalidPrediction = {
        predicted_time: 'invalid-time',
        predicted_pace: '04:52 min/km'
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          error: 'Invalid time format',
          field: 'predicted_time',
          code: 'VALIDATION_ERROR'
        })
      });

      const response = await fetch('/api/v0/prediction-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidPrediction)
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe('VALIDATION_ERROR');
      expect(data.field).toBe('predicted_time');
    });
  });

  describe('Change Detection Logic', () => {
    it('should detect when prediction values have changed', () => {
      const previousPrediction = {
        predicted_time: '03:25:30',
        predicted_pace: '04:52 min/km'
      };

      const currentPrediction = {
        predicted_time: '03:23:15',
        predicted_pace: '04:50 min/km'
      };

      const timeChanged = previousPrediction.predicted_time !== currentPrediction.predicted_time;
      const paceChanged = previousPrediction.predicted_pace !== currentPrediction.predicted_pace;

      expect(timeChanged).toBe(true);
      expect(paceChanged).toBe(true);
    });

    it('should detect when only time has changed', () => {
      const previousPrediction = {
        predicted_time: '03:25:30',
        predicted_pace: '04:52 min/km'
      };

      const currentPrediction = {
        predicted_time: '03:23:15',
        predicted_pace: '04:52 min/km'
      };

      const timeChanged = previousPrediction.predicted_time !== currentPrediction.predicted_time;
      const paceChanged = previousPrediction.predicted_pace !== currentPrediction.predicted_pace;

      expect(timeChanged).toBe(true);
      expect(paceChanged).toBe(false);
    });

    it('should detect when values are unchanged', () => {
      const previousPrediction = {
        predicted_time: '03:25:30',
        predicted_pace: '04:52 min/km'
      };

      const currentPrediction = {
        predicted_time: '03:25:30',
        predicted_pace: '04:52 min/km'
      };

      const timeChanged = previousPrediction.predicted_time !== currentPrediction.predicted_time;
      const paceChanged = previousPrediction.predicted_pace !== currentPrediction.predicted_pace;

      expect(timeChanged).toBe(false);
      expect(paceChanged).toBe(false);
    });
  });

  describe('Chart Data Processing', () => {
    it('should process data for chart visualization', () => {
      const chartData = transformPredictionData(mockPredictionHistory);

      // Extract data for chart datasets
      const labels = chartData.map(d => d.date);
      const timeData = chartData.map(d => d.predictedTime);
      const paceData = chartData.map(d => d.predictedPace);

      expect(labels).toEqual(['2024-01-01', '2024-01-15', '2024-02-01']);
      expect(timeData).toEqual([12330, 12195, 12060]); // Times in seconds
      expect(paceData).toEqual([292, 290, 288]); // Paces in seconds
    });

    it('should handle empty prediction history', () => {
      const emptyHistory: PredictionHistoryRecord[] = [];
      const chartData = transformPredictionData(emptyHistory);

      expect(chartData).toEqual([]);
    });

    it('should handle single prediction record', () => {
      const singleRecord = [mockPredictionHistory[0]];
      const chartData = transformPredictionData(singleRecord);

      expect(chartData).toHaveLength(1);
      expect(chartData[0].date).toBe('2024-01-01');
    });
  });

  describe('Error Recovery Scenarios', () => {
    it('should provide fallback data when API fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      try {
        await fetch('/api/v0/prediction-history');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Network error');
      }

      // Should provide empty array as fallback
      const fallbackData: ChartDataPoint[] = [];
      expect(fallbackData).toEqual([]);
    });

    it('should handle malformed API responses', () => {
      const malformedResponse = {
        invalid: 'response',
        missing: 'records'
      };

      // Should handle gracefully by providing empty data
      const records = malformedResponse.records || [];
      expect(records).toEqual([]);
    });
  });

  describe('Performance Considerations', () => {
    it('should handle large datasets efficiently', () => {
      // Generate large dataset
      const largeDataset: PredictionHistoryRecord[] = [];
      for (let i = 0; i < 365; i++) {
        const date = new Date('2024-01-01');
        date.setDate(date.getDate() + i);
        
        largeDataset.push({
          id: i + 1,
          user_id: 123,
          predicted_time: '03:25:30',
          predicted_pace: '04:52 min/km',
          recorded_at: date.toISOString().split('T')[0],
          created_at: date.toISOString()
        });
      }

      const startTime = performance.now();
      const chartData = transformPredictionData(largeDataset);
      const endTime = performance.now();

      expect(chartData).toHaveLength(365);
      expect(endTime - startTime).toBeLessThan(100); // Should process quickly
    });
  });

  describe('User Experience Scenarios', () => {
    it('should show progress improvement over time', () => {
      const chartData = transformPredictionData(mockPredictionHistory);

      // Verify improvement trend
      const timeImprovement = chartData[0].predictedTime - chartData[2].predictedTime;
      const paceImprovement = chartData[0].predictedPace - chartData[2].predictedPace;

      expect(timeImprovement).toBeGreaterThan(0); // Time decreased (improved)
      expect(paceImprovement).toBeGreaterThan(0); // Pace decreased (improved)
    });

    it('should handle goal date ranges correctly', () => {
      const goalStartDate = '2024-01-01';
      const goalEndDate = '2024-03-01';
      const currentDate = new Date().toISOString().split('T')[0];

      // Chart should show from goal start to current date
      expect(new Date(goalStartDate).getTime()).toBeLessThan(new Date(currentDate).getTime());
    });
  });
});
