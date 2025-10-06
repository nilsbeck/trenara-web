<script lang="ts">
  import { getContext } from 'svelte';
  import type { CalendarStore } from '$lib/types/index.js';
  import CalendarNavigation from './CalendarNavigation.svelte';
  
  // Get store from context
  const store = getContext<CalendarStore>('calendar');
  
  if (!store) {
    throw new Error('CalendarHeader must be used within a CalendarProvider');
  }
  
  // Subscribe to store state
  let storeState = $state();
  
  $effect(() => {
    const unsubscribe = store.subscribe((state) => {
      storeState = state;
    });
    
    return unsubscribe;
  });
</script>

<div class="flex items-center justify-between">
  <h2 class="card-title text-left">
    {storeState?.currentDate?.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) || ''}
  </h2>
  <CalendarNavigation />
</div>
