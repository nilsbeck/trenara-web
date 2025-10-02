<!-- Test component for PredictionChart visualization features -->
<script lang="ts">
  import PredictionChart from './PredictionChart.svelte';
  import type { ChartDataPoint } from './types.js';

  // Sample test data
  const testData: ChartDataPoint[] = [
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

  const goalStartDate = '2024-01-01';
  const goalEndDate = '2024-03-01';
</script>

<div class="p-4">
  <h2 class="text-xl font-bold mb-4">Prediction Chart Test</h2>
  
  <!-- Test with data -->
  <div class="mb-8">
    <h3 class="text-lg font-semibold mb-2">Chart with Sample Data</h3>
    <PredictionChart 
      data={testData}
      loading={false}
      error={null}
      goalStartDate={goalStartDate}
      goalEndDate={goalEndDate}
    />
  </div>

  <!-- Test loading state -->
  <div class="mb-8">
    <h3 class="text-lg font-semibold mb-2">Loading State</h3>
    <PredictionChart 
      data={[]}
      loading={true}
      error={null}
    />
  </div>

  <!-- Test error state -->
  <div class="mb-8">
    <h3 class="text-lg font-semibold mb-2">Error State</h3>
    <PredictionChart 
      data={[]}
      loading={false}
      error="Failed to load chart data"
    />
  </div>

  <!-- Test empty state -->
  <div class="mb-8">
    <h3 class="text-lg font-semibold mb-2">Empty State</h3>
    <PredictionChart 
      data={[]}
      loading={false}
      error={null}
    />
  </div>
</div>
