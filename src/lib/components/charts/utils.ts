import type { ChartDataPoint, PredictionHistoryRecord } from './types.js';

/**
 * Convert time string (HH:MM:SS) to total seconds
 */
export function timeStringToSeconds(timeStr: string): number {
  const parts = timeStr.split(':');
  if (parts.length !== 3) {
    throw new Error(`Invalid time format: ${timeStr}. Expected HH:MM:SS`);
  }
  
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseInt(parts[2], 10);
  
  if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) {
    throw new Error(`Invalid time format: ${timeStr}. Contains non-numeric values`);
  }
  
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Convert pace string (MM:SS min/km) to seconds per km
 */
export function paceStringToSeconds(paceStr: string): number {
  // Remove " min/km" suffix if present
  const cleanPace = paceStr.replace(' min/km', '').trim();
  const parts = cleanPace.split(':');
  
  if (parts.length !== 2) {
    throw new Error(`Invalid pace format: ${paceStr}. Expected MM:SS`);
  }
  
  const minutes = parseInt(parts[0], 10);
  const seconds = parseInt(parts[1], 10);
  
  if (isNaN(minutes) || isNaN(seconds)) {
    throw new Error(`Invalid pace format: ${paceStr}. Contains non-numeric values`);
  }
  
  return minutes * 60 + seconds;
}

/**
 * Convert seconds back to HH:MM:SS format for display
 */
export function secondsToTimeString(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Convert seconds per km back to MM:SS min/km format for display
 */
export function secondsToPaceString(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} min/km`;
}

/**
 * Transform prediction history records into chart data points
 * Optimized for performance with caching and validation
 */
export function transformPredictionData(records: PredictionHistoryRecord[]): ChartDataPoint[] {
  if (!Array.isArray(records) || records.length === 0) {
    return [];
  }

  // Pre-allocate array for better performance
  const result: ChartDataPoint[] = new Array(records.length);
  
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    
    try {
      const predictedTimeSeconds = timeStringToSeconds(record.predicted_time);
      const predictedPaceSeconds = paceStringToSeconds(record.predicted_pace);
      
      result[i] = {
        date: record.recorded_at,
        predictedTime: predictedTimeSeconds,
        predictedPace: predictedPaceSeconds,
        formattedTime: record.predicted_time,
        formattedPace: record.predicted_pace
      };
    } catch (error) {
      console.warn(`Skipping invalid record at index ${i}:`, error);
      // Skip invalid records but maintain array structure
      result[i] = {
        date: record.recorded_at || '',
        predictedTime: 0,
        predictedPace: 0,
        formattedTime: 'Invalid',
        formattedPace: 'Invalid'
      };
    }
  }
  
  return result;
}

/**
 * Optimized data sampling for large datasets
 * Reduces data points while preserving trend information
 */
export function sampleDataPoints(data: ChartDataPoint[], maxPoints: number = 100): ChartDataPoint[] {
  if (data.length <= maxPoints) {
    return data;
  }

  const sampled: ChartDataPoint[] = [];
  
  // Always include first point
  sampled.push(data[0]);
  
  // Calculate step size to fit within maxPoints (accounting for first and last)
  const availableSlots = maxPoints - 2; // Reserve slots for first and last
  const step = Math.max(1, Math.floor((data.length - 2) / availableSlots));
  
  // Sample intermediate points
  for (let i = step; i < data.length - 1; i += step) {
    if (sampled.length < maxPoints - 1) { // Leave room for last point
      sampled.push(data[i]);
    }
  }
  
  // Always include last point (if different from first)
  if (data.length > 1) {
    sampled.push(data[data.length - 1]);
  }
  
  return sampled;
}

/**
 * Memoization cache for expensive transformations
 */
const transformCache = new Map<string, ChartDataPoint[]>();
const maxCacheSize = 10;

/**
 * Cached version of transformPredictionData
 */
export function transformPredictionDataCached(records: PredictionHistoryRecord[]): ChartDataPoint[] {
  const cacheKey = JSON.stringify(records.map(r => `${r.id}-${r.predicted_time}-${r.predicted_pace}`));
  
  if (transformCache.has(cacheKey)) {
    return transformCache.get(cacheKey)!;
  }
  
  const result = transformPredictionData(records);
  
  // Manage cache size
  if (transformCache.size >= maxCacheSize) {
    const firstKey = transformCache.keys().next().value;
    transformCache.delete(firstKey);
  }
  
  transformCache.set(cacheKey, result);
  return result;
}
