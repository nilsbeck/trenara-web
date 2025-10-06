<script lang="ts">
  import { setContext } from 'svelte';
  import type { AuthStore } from '$lib/types/index.js';
  
  let { store, children } = $props<{
    store: AuthStore;
    children: any;
  }>();
  
  // Provide the auth store to child components
  setContext('auth', store);
</script>

{@render children()}
