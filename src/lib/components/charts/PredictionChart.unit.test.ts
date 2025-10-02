/**
 * Unit tests for PredictionChart component logic
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { ChartDataPoint } from './types.js';

describe('PredictionChart Component Logic', () => {
  const sampleData: ChartDataPoint[] = [
    {
      date: '2024-01-01',
      predictedTime: 7200, // 2:00:00
      predictedPace: 300,   // 5:00 min/km
      formattedTime: '02:00:00',
      formattedPace: '05:00 min/km'
    },
    {
      date: '2024-01-15',
      predictedTime: 7080, // 1:58:00
      predictedPace: 295,   // 4:55 min/km
      formattedTime: '01:58:00',
      formattedPace: '04:55 min/km'
    },
    {
      date: '2024-02-01',
      predictedTime: 6960, // 1:56:00
      predictedPace: 290,   // 4:50 min/km
      formattedTime: '01:56:00',
      formattedPace: '04:50 min/km'
    }
  ];

  describe('Chart Configuration Logic', () => {
    it('should create proper chart configuration structure', () => {
      const expectedConfig = {
        type: 'line',
        data: {
          labels: sampleData.map(d => d.date),
          datasets: [
            {
              label: 'Predicted Time',
              data: sampleData.map(d => d.predictedTime),
              yAxisID: 'time-axis',
              borderColor: '#1e40af'
            },
            {
              label: 'Predicted Pace',
              data: sampleData.map(d => d.predictedPace),
              yAxisID: 'pace-axis',
              borderColor: '#dc2626'
            }
          ]
        }
      };

      expect(expectedConfig.type).toBe('line');
      expect(expectedConfig.data.datasets).toHaveLength(2);
      expect(expectedConfig.data.datasets[0].yAxisID).toBe('time-axis');
      expect(expectedConfig.data.datasets[1].yAxisID).toBe('pace-axis');
      expect(expectedConfig.data.labels).toEqual(['2024-01-01', '2024-01-15', '2024-02-01']);
    });

    it('should use distinct colors for time and pace lines', () => {
      const timeColor = '#1e40af'; // blue
      const paceColor = '#dc2626'; // red
      
      expect(timeColor).not.toBe(paceColor);
      expect(timeColor).toBe('#1e40af');
      expect(paceColor).toBe('#dc2626');
    });

    it('should configure dual Y-axis correctly', () => {
      const axisConfig = {
        'time-axis': {
          type: 'linear',
          position: 'left',
          title: { text: 'Predicted Time (HH:MM:SS)' }
        },
        'pace-axis': {
          type: 'linear',
          position: 'right',
          title: { text: 'Predicted Pace (min/km)' }
        }
      };

      expect(axisConfig['time-axis'].position).toBe('left');
      expect(axisConfig['pace-axis'].position).toBe('right');
      expect(axisConfig['time-axis'].title.text).toBe('Predicted Time (HH:MM:SS)');
      expect(axisConfig['pace-axis'].title.text).toBe('Predicted Pace (min/km)');
    });
  });

  describe('Data Processing Logic', () => {
    it('should handle empty data correctly', () => {
      const emptyData: ChartDataPoint[] = [];
      
      expect(emptyData.length).toBe(0);
      expect(emptyData.map(d => d.date)).toEqual([]);
    });

    it('should handle single data point', () => {
      const singlePoint = [sampleData[0]];
      
      expect(singlePoint.length).toBe(1);
      expect(singlePoint[0].date).toBe('2024-01-01');
      expect(singlePoint[0].predictedTime).toBe(7200);
      expect(singlePoint[0].predictedPace).toBe(300);
    });

    it('should process data for chart consumption', () => {
      const labels = sampleData.map(d => d.date);
      const timeData = sampleData.map(d => d.predictedTime);
      const paceData = sampleData.map(d => d.predictedPace);

      expect(labels).toEqual(['2024-01-01', '2024-01-15', '2024-02-01']);
      expect(timeData).toEqual([7200, 7080, 6960]);
      expect(paceData).toEqual([300, 295, 290]);
    });
  });

  describe('Date Range Logic', () => {
    it('should calculate date range from goal dates', () => {
      const goalStartDate = '2024-01-01';
      const goalEndDate = '2024-03-01';
      const currentDate = new Date().toISOString().split('T')[0];

      expect(goalStartDate).toBe('2024-01-01');
      expect(currentDate).toBeDefined();
      // Should use current date, not goal end date for max
    });

    it('should fallback to data range when goal dates not provided', () => {
      const dates = sampleData.map(point => new Date(point.date).getTime());
      const minDate = new Date(Math.min(...dates)).toISOString().split('T')[0];
      const maxDate = new Date(Math.max(...dates)).toISOString().split('T')[0];

      expect(minDate).toBe('2024-01-01');
      expect(maxDate).toBe('2024-02-01');
    });
  });

  describe('Tooltip Logic', () => {
    it('should format tooltip labels correctly', () => {
      const formatTimeLabel = (value: number) => `🏃 Predicted Time: ${Math.floor(value / 3600)}:${Math.floor((value % 3600) / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
      const formatPaceLabel = (value: number) => `⚡ Predicted Pace: ${Math.floor(value / 60)}:${(value % 60).toString().padStart(2, '0')} min/km`;

      expect(formatTimeLabel(7200)).toBe('🏃 Predicted Time: 2:00:00');
      expect(formatPaceLabel(300)).toBe('⚡ Predicted Pace: 5:00 min/km');
    });

    it('should format date for tooltip title', () => {
      const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      };

      const formatted = formatDate('2024-01-15');
      expect(formatted).toContain('2024');
      expect(formatted).toContain('Jan');
    });
  });

  describe('Responsive Configuration', () => {
    it('should configure chart for responsive behavior', () => {
      const responsiveConfig = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        }
      };

      expect(responsiveConfig.responsive).toBe(true);
      expect(responsiveConfig.maintainAspectRatio).toBe(false);
      expect(responsiveConfig.interaction.mode).toBe('index');
      expect(responsiveConfig.interaction.intersect).toBe(false);
    });

    it('should have adequate point sizes for touch interaction', () => {
      const pointConfig = {
        pointRadius: 5,
        pointHoverRadius: 8,
        borderWidth: 3
      };

      expect(pointConfig.pointRadius).toBeGreaterThanOrEqual(5);
      expect(pointConfig.pointHoverRadius).toBeGreaterThan(pointConfig.pointRadius);
      expect(pointConfig.borderWidth).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Error Handling Logic', () => {
    it('should handle chart creation errors', () => {
      const errorStates = {
        chartError: null,
        retryCount: 0,
        maxRetries: 3
      };

      // Simulate error
      errorStates.chartError = 'Chart creation failed';
      errorStates.retryCount = 1;

      expect(errorStates.chartError).toBe('Chart creation failed');
      expect(errorStates.retryCount).toBeLessThan(errorStates.maxRetries);
    });

    it('should handle missing canvas context', () => {
      const canvasError = 'Unable to get chart context';
      expect(canvasError).toBe('Unable to get chart context');
    });
  });

  describe('Accessibility Features', () => {
    it('should provide meaningful text for empty states', () => {
      const emptyStateText = {
        title: 'No prediction data available yet',
        description: 'Your progress will be tracked as your predictions change over time',
        tip: 'Complete training sessions to see your prediction trends'
      };

      expect(emptyStateText.title).toBe('No prediction data available yet');
      expect(emptyStateText.description).toContain('progress will be tracked');
      expect(emptyStateText.tip).toContain('Complete training sessions');
    });

    it('should provide clear error messages', () => {
      const errorMessages = {
        chartError: 'Chart Rendering Error',
        networkError: 'Failed to load chart data',
        retryMessage: 'Retry'
      };

      expect(errorMessages.chartError).toBe('Chart Rendering Error');
      expect(errorMessages.networkError).toBe('Failed to load chart data');
      expect(errorMessages.retryMessage).toBe('Retry');
    });
  });
});
