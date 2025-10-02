import { describe, it, expect } from 'vitest';
import {
  timeStringToSeconds,
  paceStringToSeconds,
  secondsToTimeString,
  secondsToPaceString,
  transformPredictionData
} from './utils.js';
import type { PredictionHistoryRecord } from './types.js';

describe('Chart Utils', () => {
  describe('timeStringToSeconds', () => {
    it('should convert HH:MM:SS to total seconds', () => {
      expect(timeStringToSeconds('01:30:45')).toBe(5445); // 1*3600 + 30*60 + 45
      expect(timeStringToSeconds('00:05:30')).toBe(330);  // 5*60 + 30
      expect(timeStringToSeconds('02:00:00')).toBe(7200); // 2*3600
    });

    it('should handle edge cases', () => {
      expect(timeStringToSeconds('00:00:00')).toBe(0);
      expect(timeStringToSeconds('23:59:59')).toBe(86399);
    });

    it('should throw error for invalid format', () => {
      expect(() => timeStringToSeconds('1:30')).toThrow('Invalid time format');
      expect(() => timeStringToSeconds('01:30:XX')).toThrow('Invalid time format');
      expect(() => timeStringToSeconds('invalid')).toThrow('Invalid time format');
    });
  });

  describe('paceStringToSeconds', () => {
    it('should convert MM:SS min/km to seconds per km', () => {
      expect(paceStringToSeconds('05:30 min/km')).toBe(330); // 5*60 + 30
      expect(paceStringToSeconds('04:15')).toBe(255);        // 4*60 + 15
      expect(paceStringToSeconds('06:00 min/km')).toBe(360); // 6*60
    });

    it('should handle edge cases', () => {
      expect(paceStringToSeconds('00:00')).toBe(0);
      expect(paceStringToSeconds('10:59 min/km')).toBe(659);
    });

    it('should throw error for invalid format', () => {
      expect(() => paceStringToSeconds('5:30:45')).toThrow('Invalid pace format');
      expect(() => paceStringToSeconds('05:XX')).toThrow('Invalid pace format');
      expect(() => paceStringToSeconds('invalid')).toThrow('Invalid pace format');
    });
  });

  describe('secondsToTimeString', () => {
    it('should convert seconds back to HH:MM:SS format', () => {
      expect(secondsToTimeString(5445)).toBe('01:30:45');
      expect(secondsToTimeString(330)).toBe('00:05:30');
      expect(secondsToTimeString(7200)).toBe('02:00:00');
    });

    it('should handle edge cases', () => {
      expect(secondsToTimeString(0)).toBe('00:00:00');
      expect(secondsToTimeString(86399)).toBe('23:59:59');
    });
  });

  describe('secondsToPaceString', () => {
    it('should convert seconds back to MM:SS min/km format', () => {
      expect(secondsToPaceString(330)).toBe('05:30 min/km');
      expect(secondsToPaceString(255)).toBe('04:15 min/km');
      expect(secondsToPaceString(360)).toBe('06:00 min/km');
    });

    it('should handle edge cases', () => {
      expect(secondsToPaceString(0)).toBe('00:00 min/km');
      expect(secondsToPaceString(659)).toBe('10:59 min/km');
    });
  });

  describe('transformPredictionData', () => {
    it('should transform prediction history records to chart data points', () => {
      const records: PredictionHistoryRecord[] = [
        {
          id: 1,
          user_id: 123,
          predicted_time: '01:30:45',
          predicted_pace: '05:30 min/km',
          recorded_at: '2024-01-15',
          created_at: '2024-01-15T10:00:00Z'
        },
        {
          id: 2,
          user_id: 123,
          predicted_time: '01:28:30',
          predicted_pace: '05:15 min/km',
          recorded_at: '2024-01-20',
          created_at: '2024-01-20T10:00:00Z'
        }
      ];

      const result = transformPredictionData(records);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        date: '2024-01-15',
        predictedTime: 5445, // 01:30:45 in seconds
        predictedPace: 330,  // 05:30 in seconds
        formattedTime: '01:30:45',
        formattedPace: '05:30 min/km'
      });
      expect(result[1]).toEqual({
        date: '2024-01-20',
        predictedTime: 5310, // 01:28:30 in seconds
        predictedPace: 315,  // 05:15 in seconds
        formattedTime: '01:28:30',
        formattedPace: '05:15 min/km'
      });
    });

    it('should handle empty records array', () => {
      const result = transformPredictionData([]);
      expect(result).toEqual([]);
    });

    it('should handle records with different date formats', () => {
      const records: PredictionHistoryRecord[] = [
        {
          id: 1,
          user_id: 123,
          predicted_time: '02:00:00',
          predicted_pace: '06:00 min/km',
          recorded_at: '2024-01-01',
          created_at: '2024-01-01T00:00:00Z'
        }
      ];

      const result = transformPredictionData(records);

      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2024-01-01');
    });

    it('should preserve original formatting in formatted fields', () => {
      const records: PredictionHistoryRecord[] = [
        {
          id: 1,
          user_id: 123,
          predicted_time: '0:45:30',
          predicted_pace: '4:15 min/km',
          recorded_at: '2024-01-15',
          created_at: '2024-01-15T10:00:00Z'
        }
      ];

      const result = transformPredictionData(records);

      expect(result[0].formattedTime).toBe('0:45:30');
      expect(result[0].formattedPace).toBe('4:15 min/km');
    });

    it('should handle malformed time data gracefully', () => {
      const records: PredictionHistoryRecord[] = [
        {
          id: 1,
          user_id: 123,
          predicted_time: 'invalid-time',
          predicted_pace: '05:30 min/km',
          recorded_at: '2024-01-15',
          created_at: '2024-01-15T10:00:00Z'
        }
      ];

      const result = transformPredictionData(records);
      expect(result).toHaveLength(1);
      expect(result[0].formattedTime).toBe('Invalid');
      expect(result[0].predictedTime).toBe(0);
    });

    it('should handle malformed pace data gracefully', () => {
      const records: PredictionHistoryRecord[] = [
        {
          id: 1,
          user_id: 123,
          predicted_time: '01:30:45',
          predicted_pace: 'invalid-pace',
          recorded_at: '2024-01-15',
          created_at: '2024-01-15T10:00:00Z'
        }
      ];

      const result = transformPredictionData(records);
      expect(result).toHaveLength(1);
      expect(result[0].formattedPace).toBe('Invalid');
      expect(result[0].predictedPace).toBe(0);
    });

    it('should preserve order of records when transforming', () => {
      const records: PredictionHistoryRecord[] = [
        {
          id: 2,
          user_id: 123,
          predicted_time: '01:28:30',
          predicted_pace: '05:15 min/km',
          recorded_at: '2024-01-20',
          created_at: '2024-01-20T10:00:00Z'
        },
        {
          id: 1,
          user_id: 123,
          predicted_time: '01:30:45',
          predicted_pace: '05:30 min/km',
          recorded_at: '2024-01-15',
          created_at: '2024-01-15T10:00:00Z'
        }
      ];

      const result = transformPredictionData(records);

      // Should preserve input order (database query handles sorting)
      expect(result[0].date).toBe('2024-01-20');
      expect(result[1].date).toBe('2024-01-15');
    });
  });
});
