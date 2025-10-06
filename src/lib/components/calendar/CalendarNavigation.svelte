<script lang="ts">
  import { getContext } from 'svelte';
  import type { CalendarStore } from '$lib/types/index.js';
  
  // Get store from context
  const store = getContext<CalendarStore>('calendar');
  
  if (!store) {
    throw new Error('CalendarNavigation must be used within a CalendarProvider');
  }
</script>

<div class="flex items-center">
  <button
    aria-label="calendar refresh"
    class="focus:text-gray-400 hover:text-gray-400 text-gray-800 dark:text-gray-100"
    onclick={() => store.navigation.refresh()}
  >
    <svg
      width="20"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      xmlns:xlink="http://www.w3.org/1999/xlink"
      class="icon-tabler"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M20 11A8.1 8.1 0 0 0 4.5 9M4 5v4h4" />
      <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
    </svg>
  </button>
  <button
    aria-label="calendar backward"
    class="focus:text-gray-400 hover:text-gray-400 text-gray-800 dark:text-gray-100"
    onclick={() => store.navigation.goToPreviousMonth()}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="icon icon-tabler icon-tabler-chevron-left"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      stroke-width="1.5"
      stroke="currentColor"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <polyline points="15 6 9 12 15 18" />
    </svg>
  </button>
  <button
    aria-label="calendar forward"
    class="focus:text-gray-400 hover:text-gray-400 ml-3 text-gray-800 dark:text-gray-100"
    onclick={() => store.navigation.goToNextMonth()}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="icon icon-tabler icon-tabler-chevron-right"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      stroke-width="1.5"
      stroke="currentColor"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <polyline points="9 6 15 12 9 18" />
    </svg>
  </button>
</div>
