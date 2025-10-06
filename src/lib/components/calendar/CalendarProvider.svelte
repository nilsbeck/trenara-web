<script lang="ts">
  import { setContext } from 'svelte';
  import type { CalendarStore } from '$lib/types/index.js';
  
  let { store, children } = $props<{
    store: CalendarStore;
    children: any;
  }>();
  
  // Provide the calendar store to child components
  setContext('calendar', store);
</script>

{@render children()}
