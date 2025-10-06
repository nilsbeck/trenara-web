<script lang="ts">
  import { getContext } from 'svelte';
  import type { AuthStore } from '$lib/types/index.js';
  
  // Get auth store from context
  const authStore = getContext<AuthStore>('auth');
  
  if (!authStore) {
    throw new Error('AuthGuard must be used within an AuthProvider');
  }

  // Props
  let { 
    children,
    fallback,
    requireAuth = true,
    redirectTo,
    onUnauthorized
  } = $props<{
    children: any;
    fallback?: any;
    requireAuth?: boolean;
    redirectTo?: string;
    onUnauthorized?: () => void;
  }>();

  // Check if user meets auth requirements
  let isAuthorized = $derived(
    requireAuth ? authStore.isAuthenticated : !authStore.isAuthenticated
  );

  // Handle unauthorized access
  $effect(() => {
    if (!isAuthorized && !authStore.isLoading) {
      if (onUnauthorized) {
        onUnauthorized();
      } else if (redirectTo && typeof window !== 'undefined') {
        window.location.href = redirectTo;
      }
    }
  });
</script>

{#if authStore.isLoading}
  <!-- Loading state -->
  <div class="flex items-center justify-center p-8">
    <div class="flex items-center space-x-2">
      <svg class="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span class="text-sm text-gray-600 dark:text-gray-400">
        Checking authentication...
      </span>
    </div>
  </div>
{:else if isAuthorized}
  <!-- User is authorized, render children -->
  {@render children()}
{:else if fallback}
  <!-- User is not authorized, render fallback -->
  {@render fallback()}
{:else}
  <!-- Default unauthorized message -->
  <div class="flex items-center justify-center p-8">
    <div class="text-center">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">
        {requireAuth ? 'Authentication Required' : 'Already Signed In'}
      </h3>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {requireAuth 
          ? 'You need to sign in to access this content.' 
          : 'You are already signed in.'}
      </p>
    </div>
  </div>
{/if}
