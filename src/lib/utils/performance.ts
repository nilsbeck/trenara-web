/**
 * Performance monitoring utilities for the prediction tracking feature
 */

export interface PerformanceMetrics {
  operation: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics[] = [];
  private maxMetrics = 100;

  private constructor() {}

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Start timing an operation
   */
  public startTiming(operation: string): () => void {
    const startTime = performance.now();
    
    return (metadata?: Record<string, any>) => {
      const duration = performance.now() - startTime;
      this.recordMetric({
        operation,
        duration,
        timestamp: Date.now(),
        metadata
      });
    };
  }

  /**
   * Record a performance metric
   */
  private recordMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);
    
    // Keep only the most recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    // Log slow operations in development
    if (import.meta.env.DEV && metric.duration > 100) {
      console.warn(`Slow operation detected: ${metric.operation} took ${metric.duration.toFixed(2)}ms`, metric.metadata);
    }
  }

  /**
   * Get performance statistics
   */
  public getStats(operation?: string): {
    count: number;
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
    totalDuration: number;
  } {
    const filteredMetrics = operation 
      ? this.metrics.filter(m => m.operation === operation)
      : this.metrics;

    if (filteredMetrics.length === 0) {
      return {
        count: 0,
        averageDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        totalDuration: 0
      };
    }

    const durations = filteredMetrics.map(m => m.duration);
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);

    return {
      count: filteredMetrics.length,
      averageDuration: totalDuration / filteredMetrics.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      totalDuration
    };
  }

  /**
   * Clear all metrics
   */
  public clear(): void {
    this.metrics = [];
  }

  /**
   * Get all metrics for debugging
   */
  public getAllMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();

/**
 * Decorator for timing async functions
 */
export function timed(operation: string) {
  return function <T extends (...args: any[]) => Promise<any>>(
    target: any,
    propertyName: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const method = descriptor.value!;
    
    descriptor.value = (async function (this: any, ...args: any[]) {
      const endTiming = performanceMonitor.startTiming(operation);
      try {
        const result = await method.apply(this, args);
        endTiming({ success: true, args: args.length });
        return result;
      } catch (error) {
        endTiming({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        throw error;
      }
    }) as T;
  };
}

/**
 * Simple timing utility for inline use
 */
export async function timeAsync<T>(
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  const endTiming = performanceMonitor.startTiming(operation);
  try {
    const result = await fn();
    endTiming({ ...metadata, success: true });
    return result;
  } catch (error) {
    endTiming({ 
      ...metadata, 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    throw error;
  }
}

/**
 * Memory usage monitoring
 */
export function getMemoryUsage(): {
  used: number;
  total: number;
  percentage: number;
} | null {
  if (typeof performance !== 'undefined' && 'memory' in performance) {
    const memory = (performance as any).memory;
    return {
      used: memory.usedJSHeapSize,
      total: memory.totalJSHeapSize,
      percentage: (memory.usedJSHeapSize / memory.totalJSHeapSize) * 100
    };
  }
  return null;
}

/**
 * Check if performance is degraded
 */
export function isPerformanceDegraded(): boolean {
  const chartStats = performanceMonitor.getStats('chart-render');
  const apiStats = performanceMonitor.getStats('api-request');
  
  // Consider performance degraded if average operations are taking too long
  return (
    (chartStats.count > 0 && chartStats.averageDuration > 500) ||
    (apiStats.count > 0 && apiStats.averageDuration > 2000)
  );
}
