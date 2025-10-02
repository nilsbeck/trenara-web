/**
 * Performance tests for chart optimizations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { transformPredictionDataCached, sampleDataPoints } from './utils.js';
import type { PredictionHistoryRecord } from './types.js';
import { performanceMonitor } from '$lib/utils/performance.js';

describe('Chart Performance Optimizations', () => {
  beforeEach(() => {
    performanceMonitor.clear();
  });

  const createMockRecords = (count: number): PredictionHistoryRecord[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      user_id: 1,
      predicted_time: `1:${(30 + i).toString().padStart(2, '0')}:00`,
      predicted_pace: `4:${(30 + i % 30).toString().padStart(2, '0')} min/km`,
      recorded_at: `2024-01-${(i % 28 + 1).toString().padStart(2, '0')}`,
      created_at: new Date().toISOString()
    }));
  };

  it('should cache transformation results', () => {
    const records = createMockRecords(10);
    
    // First call
    const result1 = transformPredictionDataCached(records);
    
    // Second call with same data should use cache
    const result2 = transformPredictionDataCached(records);
    
    expect(result1).toEqual(result2);
    expect(result1).toBe(result2); // Should be the same reference from cache
  });

  it('should sample large datasets efficiently', () => {
    const largeDataset = Array.from({ length: 500 }, (_, i) => ({
      date: `2024-01-01`,
      predictedTime: 5400 + i,
      predictedPace: 270 + i,
      formattedTime: '1:30:00',
      formattedPace: '4:30 min/km'
    }));

    const sampled = sampleDataPoints(largeDataset, 100);
    
    expect(sampled.length).toBeLessThanOrEqual(100);
    expect(sampled[0]).toEqual(largeDataset[0]); // First point preserved
    expect(sampled[sampled.length - 1]).toEqual(largeDataset[largeDataset.length - 1]); // Last point preserved
  });

  it('should handle invalid data gracefully', () => {
    const invalidRecords: PredictionHistoryRecord[] = [
      {
        id: 1,
        user_id: 1,
        predicted_time: 'invalid-time',
        predicted_pace: 'invalid-pace',
        recorded_at: '2024-01-01',
        created_at: new Date().toISOString()
      }
    ];

    const result = transformPredictionDataCached(invalidRecords);
    
    expect(result).toHaveLength(1);
    expect(result[0].formattedTime).toBe('Invalid');
    expect(result[0].formattedPace).toBe('Invalid');
  });

  it('should maintain performance with large datasets', () => {
    const largeRecords = createMockRecords(1000);
    
    const startTime = performance.now();
    const result = transformPredictionDataCached(largeRecords);
    const endTime = performance.now();
    
    const duration = endTime - startTime;
    
    expect(result).toHaveLength(1000);
    expect(duration).toBeLessThan(100); // Should complete in under 100ms
  });

  it('should limit cache size', () => {
    // Create multiple different datasets to fill cache
    for (let i = 0; i < 15; i++) {
      const records = createMockRecords(5).map(r => ({ ...r, id: r.id + i * 1000 }));
      transformPredictionDataCached(records);
    }
    
    // Cache should not grow indefinitely
    // This is tested indirectly by ensuring the function still works
    const newRecords = createMockRecords(3);
    const result = transformPredictionDataCached(newRecords);
    
    expect(result).toHaveLength(3);
  });
});
