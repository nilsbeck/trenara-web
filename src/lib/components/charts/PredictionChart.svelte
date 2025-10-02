<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    Chart,
    CategoryScale,
    LinearScale,
    TimeScale,
    PointElement,
    LineElement,
    LineController,
    Title,
    Tooltip,
    Legend,
    type ChartConfiguration
  } from 'chart.js';
  import 'chartjs-adapter-date-fns';
  import type { ChartProps, ChartDataPoint } from './types.js';
  import { secondsToTimeString, secondsToPaceString } from './utils.js';
  import { timeAsync } from '$lib/utils/performance.js';

  export let data: ChartDataPoint[] = [];
  export let loading = false;
  export let error: string | null = null;
  export let goalStartDate: string | null = null;
  export let goalEndDate: string | null = null;

  let chartError: string | null = null;
  let retryCount = 0;
  let maxRetries = 3;

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;
  
  // Performance optimization state
  let isChartReady = false;
  let animationId: number | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let lastDataHash: string | null = null;

  // Register Chart.js components
  Chart.register(
    CategoryScale,
    LinearScale,
    TimeScale,
    PointElement,
    LineElement,
    LineController,
    Title,
    Tooltip,
    Legend
  );

  // Performance optimization functions
  function generateDataHash(data: ChartDataPoint[]): string {
    return JSON.stringify(data.map(d => `${d.date}-${d.predictedTime}-${d.predictedPace}`));
  }

  function shouldUpdateChart(newData: ChartDataPoint[]): boolean {
    const newHash = generateDataHash(newData);
    if (lastDataHash === newHash) {
      return false;
    }
    lastDataHash = newHash;
    return true;
  }

  function debounce<T extends (...args: any[]) => void>(func: T, wait: number): T {
    let timeout: NodeJS.Timeout;
    return ((...args: any[]) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    }) as T;
  }

  function createChart() {
    if (!canvas) {
      chartError = 'Chart canvas not available';
      return;
    }

    if (!data.length) {
      // This is not an error - just no data to display
      chartError = null;
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      chartError = 'Unable to get chart context';
      return;
    }

    try {
      chartError = null; // Clear any previous errors

    // Prepare data for Chart.js
    const labels = data.map(point => point.date);
    const timeData = data.map(point => point.predictedTime);
    const paceData = data.map(point => point.predictedPace);

    // Calculate date range for X-axis
    let minDate: string | undefined;
    let maxDate: string | undefined;
    
    if (data.length > 0) {
      // Get the date range from actual data
      const dates = data.map(point => new Date(point.date).getTime());
      const firstDataDate = new Date(Math.min(...dates)).toISOString().split('T')[0];
      const lastDataDate = new Date(Math.max(...dates)).toISOString().split('T')[0];
      
      // Start from first data point, but not earlier than goal start date
      if (goalStartDate) {
        const goalStart = new Date(goalStartDate).getTime();
        const firstData = new Date(firstDataDate).getTime();
        minDate = firstData >= goalStart ? firstDataDate : goalStartDate;
      } else {
        minDate = firstDataDate;
      }
      
      // End at current date or last data point, whichever is later
      const currentDate = new Date().toISOString().split('T')[0];
      const currentTime = new Date(currentDate).getTime();
      const lastDataTime = new Date(lastDataDate).getTime();
      maxDate = lastDataTime > currentTime ? lastDataDate : currentDate;
      
      // Special handling for single data point - show a reasonable range around it
      if (data.length === 1) {
        const singleDataTime = new Date(firstDataDate).getTime();
        const dayInMs = 24 * 60 * 60 * 1000;
        
        // Show 3 days before and after the single data point (or until goal boundaries)
        const suggestedMinTime = singleDataTime - (3 * dayInMs);
        const suggestedMaxTime = singleDataTime + (3 * dayInMs);
        
        // Respect goal start date as minimum
        if (goalStartDate) {
          const goalStartTime = new Date(goalStartDate).getTime();
          minDate = new Date(Math.max(suggestedMinTime, goalStartTime)).toISOString().split('T')[0];
        } else {
          minDate = new Date(suggestedMinTime).toISOString().split('T')[0];
        }
        
        // Don't extend past current date
        maxDate = new Date(Math.min(suggestedMaxTime, currentTime)).toISOString().split('T')[0];
      }
      
    } else if (goalStartDate && goalEndDate) {
      // Fallback to goal dates if no data available
      minDate = goalStartDate;
      maxDate = new Date().toISOString().split('T')[0]; // Current date
    }

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Predicted Time',
            data: timeData,
            borderColor: '#1e40af', // blue-800 - more distinct color
            backgroundColor: 'rgba(30, 64, 175, 0.1)',
            borderWidth: 3,
            pointRadius: data.length === 1 ? 8 : 5, // Larger points for single data point
            pointHoverRadius: data.length === 1 ? 12 : 8,
            pointBackgroundColor: '#1e40af',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointHoverBackgroundColor: '#1e40af',
            pointHoverBorderColor: '#ffffff',
            pointHoverBorderWidth: 3,
            yAxisID: 'time-axis',
            tension: 0.2
          },
          {
            label: 'Predicted Pace',
            data: paceData,
            borderColor: '#dc2626', // red-600 - more distinct color
            backgroundColor: 'rgba(220, 38, 38, 0.1)',
            borderWidth: 3,
            pointRadius: data.length === 1 ? 8 : 5, // Larger points for single data point
            pointHoverRadius: data.length === 1 ? 12 : 8,
            pointBackgroundColor: '#dc2626',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointHoverBackgroundColor: '#dc2626',
            pointHoverBorderColor: '#ffffff',
            pointHoverBorderWidth: 3,
            yAxisID: 'pace-axis',
            tension: 0.2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: data.length > 20 ? 0 : 750, // Disable animation for large datasets
          easing: 'easeOutQuart'
        },
        interaction: {
          mode: 'index',
          intersect: false
        },
        elements: {
          point: {
            radius: data.length > 50 ? 2 : 5, // Smaller points for large datasets
            hoverRadius: data.length > 50 ? 4 : 8
          },
          line: {
            tension: data.length > 30 ? 0 : 0.2 // Less smoothing for large datasets
          }
        },
        plugins: {
          title: {
            display: true,
            text: data.length === 1 ? 'Initial Prediction Baseline' : 'Prediction Progress Over Time',
            font: {
              size: 18,
              weight: 'bold'
            },
            padding: {
              top: 10,
              bottom: 20
            }
          },
          legend: {
            display: true,
            position: 'top',
            labels: {
              usePointStyle: true,
              pointStyle: 'line',
              padding: 20,
              font: {
                size: 14
              }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            titleColor: '#ffffff',
            bodyColor: '#ffffff',
            borderColor: 'rgba(255, 255, 255, 0.2)',
            borderWidth: 1,
            cornerRadius: 8,
            displayColors: true,
            padding: 12,
            titleFont: {
              size: 14,
              weight: 'bold'
            },
            bodyFont: {
              size: 13
            },
            callbacks: {
              title: function(context) {
                const date = new Date(context[0].label);
                return date.toLocaleDateString('en-US', {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                });
              },
              label: function(context) {
                const datasetLabel = context.dataset.label;
                const value = context.parsed.y;
                
                if (datasetLabel === 'Predicted Time') {
                  return `🏃 ${datasetLabel}: ${secondsToTimeString(value)}`;
                } else if (datasetLabel === 'Predicted Pace') {
                  return `⚡ ${datasetLabel}: ${secondsToPaceString(value)}`;
                }
                return `${datasetLabel}: ${value}`;
              },
              afterBody: function(context) {
                // Add additional context about the prediction
                const tips = ['', '💡 Tip: Lower values indicate better performance'];
                
                // Add context for single data point
                if (data.length === 1) {
                  tips.push('📊 This is your first prediction - keep training to see progress!');
                }
                
                return tips;
              }
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'day',
              displayFormats: {
                day: 'MMM dd',
                week: 'MMM dd',
                month: 'MMM yyyy'
              },
              tooltipFormat: 'MMM dd, yyyy'
            },
            title: {
              display: true,
              text: 'Training Period',
              font: {
                size: 14,
                weight: 'bold'
              },
              padding: {
                top: 10
              }
            },
            min: minDate,
            max: maxDate,
            grid: {
              color: 'rgba(0, 0, 0, 0.1)',
              lineWidth: 1
            },
            ticks: {
              maxTicksLimit: 8,
              font: {
                size: 12
              }
            }
          },
          'time-axis': {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Predicted Time (HH:MM:SS)',
              color: '#1e40af',
              font: {
                size: 14,
                weight: 'bold'
              },
              padding: {
                bottom: 10
              }
            },
            ticks: {
              callback: function(value) {
                return secondsToTimeString(Number(value));
              },
              color: '#1e40af',
              font: {
                size: 11,
                weight: '600'
              },
              maxTicksLimit: 6
            },
            grid: {
              drawOnChartArea: false,
              color: '#1e40af',
              lineWidth: 1
            }
          },
          'pace-axis': {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Predicted Pace (min/km)',
              color: '#dc2626',
              font: {
                size: 14,
                weight: 'bold'
              },
              padding: {
                bottom: 10
              }
            },
            ticks: {
              callback: function(value) {
                return secondsToPaceString(Number(value));
              },
              color: '#dc2626',
              font: {
                size: 11,
                weight: '600'
              },
              maxTicksLimit: 6
            },
            grid: {
              drawOnChartArea: true,
              color: 'rgba(220, 38, 38, 0.1)',
              lineWidth: 1
            }
          }
        }
      }
    };

      // Use synchronous performance monitoring for chart creation
      const startTime = performance.now();
      chart = new Chart(ctx, config);
      const duration = performance.now() - startTime;
      
      // Log performance in development
      if (import.meta.env.DEV && duration > 100) {
        console.warn(`Chart creation took ${duration.toFixed(2)}ms`, { 
          dataPoints: data.length, 
          hasGoalDates: !!(goalStartDate && goalEndDate) 
        });
      }
      isChartReady = true;
      retryCount = 0; // Reset retry count on successful creation
      
      // Set up resize observer for better performance
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(debounce(() => {
          if (chart && isChartReady) {
            chart.resize();
          }
        }, 100));
        resizeObserver.observe(canvas);
      }
    } catch (error) {
      console.error('Failed to create chart:', error);
      chartError = error instanceof Error ? error.message : 'Failed to create chart';
      
      // Retry logic for chart creation
      if (retryCount < maxRetries) {
        retryCount++;
        console.log(`Retrying chart creation (attempt ${retryCount}/${maxRetries})`);
        setTimeout(() => {
          createChart();
        }, 1000 * retryCount);
      }
    }
  }

  function destroyChart() {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    
    if (chart) {
      chart.destroy();
      chart = null;
    }
    
    isChartReady = false;
  }

  function updateChart() {
    // Skip update if data hasn't changed
    if (!shouldUpdateChart(data)) {
      return;
    }
    
    try {
      // Use requestAnimationFrame for smoother updates
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      
      animationId = requestAnimationFrame(() => {
        destroyChart();
        createChart();
        animationId = null;
      });
    } catch (error) {
      console.error('Failed to update chart:', error);
      chartError = 'Failed to update chart';
    }
  }

  function retryChart() {
    retryCount = 0;
    chartError = null;
    updateChart();
  }

  onMount(() => {
    if (data.length > 0) {
      // Delay chart creation slightly to ensure DOM is ready
      requestAnimationFrame(() => {
        createChart();
      });
    }
    
    // Set up visibility change handler
    if (typeof document !== 'undefined') {
      visibilityChangeHandler = () => {
        if (document.hidden && chart) {
          // Pause chart updates when tab is not visible
          chart.stop();
        } else if (!document.hidden && chart && isChartReady) {
          // Resume chart updates when tab becomes visible
          chart.update('none'); // Update without animation
        }
      };
      
      document.addEventListener('visibilitychange', visibilityChangeHandler);
    }
  });

  onDestroy(() => {
    // Comprehensive cleanup
    destroyChart();
    
    // Clear any remaining timeouts or intervals
    if (typeof window !== 'undefined') {
      // Clear any pending animation frames
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    }
    
    // Clean up visibility change handler
    if (visibilityChangeHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', visibilityChangeHandler);
    }
  });

  // Reactive statement to update chart when data changes
  $: if (data && canvas && typeof window !== 'undefined') {
    updateChart();
  }
  
  // Handle visibility changes for performance
  let visibilityChangeHandler: (() => void) | null = null;
</script>

<div class="prediction-chart-container">
  {#if loading}
    <div class="flex items-center justify-center h-64">
      <div class="text-gray-500 flex items-center">
        <span class="loading loading-spinner loading-sm mr-2"></span>
        Loading chart data...
      </div>
    </div>
  {:else if error}
    <div class="flex flex-col items-center justify-center h-64 p-4">
      <div class="text-red-500 text-center mb-4">
        <p class="font-medium">Chart Error</p>
        <p class="text-sm">{error}</p>
      </div>
      <button class="btn btn-sm btn-outline" onclick={retryChart}>
        Retry
      </button>
    </div>
  {:else if chartError}
    <div class="flex flex-col items-center justify-center h-64 p-4">
      <div class="text-red-500 text-center mb-4">
        <p class="font-medium">Chart Rendering Error</p>
        <p class="text-sm">{chartError}</p>
        {#if retryCount > 0}
          <p class="text-xs mt-1">Retry attempt {retryCount}/{maxRetries}</p>
        {/if}
      </div>
      {#if retryCount < maxRetries}
        <button class="btn btn-sm btn-outline" onclick={retryChart}>
          Retry
        </button>
      {:else}
        <div class="text-xs text-gray-500 text-center">
          <p>Chart rendering failed after {maxRetries} attempts.</p>
          <p>Please refresh the page or contact support if the issue persists.</p>
        </div>
      {/if}
    </div>
  {:else if data.length === 0}
    <div class="flex items-center justify-center h-64">
      <div class="text-gray-500 text-center">
        <div class="mb-4">
          <svg class="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
          </svg>
        </div>
        <p class="mb-2 font-medium">No prediction data available yet</p>
        <p class="text-sm">Your progress will be tracked as your predictions change over time</p>
        <p class="text-xs mt-2 text-gray-400">Complete training sessions to see your prediction trends</p>
      </div>
    </div>
  {:else}
    <div class="chart-wrapper">
      <canvas bind:this={canvas}></canvas>
    </div>
  {/if}
</div>

<style>
  .prediction-chart-container {
    width: 100%;
    height: 450px;
    position: relative;
  }

  .chart-wrapper {
    position: relative;
    height: 100%;
    width: 100%;
    background: white;
    border-radius: 0.375rem;
  }

  /* Dark mode support */
  :global(.dark) .chart-wrapper {
    background: #374151;
    color: white;
  }

  /* Mobile optimization */
  @media (max-width: 768px) {
    .prediction-chart-container {
      height: 350px;
    }
  }

  @media (max-width: 480px) {
    .prediction-chart-container {
      height: 300px;
    }
  }

  /* Loading and error states styling */
  .prediction-chart-container .flex {
    border-radius: 0.375rem;
  }

  /* Loading animation */
  .prediction-chart-container .loading {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  /* Smooth transitions for state changes */
  .prediction-chart-container > * {
    transition: opacity 0.3s ease-in-out, transform 0.3s ease-in-out;
  }

  /* Performance optimizations */
  .chart-wrapper canvas {
    will-change: transform;
  }





  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .prediction-chart-container,
    .chart-wrapper,
    .prediction-chart-container > * {
      transition: none;
    }
    
    .loading {
      animation: none;
    }
  }
</style>
