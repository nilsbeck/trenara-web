<script lang="ts">
  import { getContext } from 'svelte';
  import type { AuthStore } from '$lib/types/index.js';
  
  // Get auth store from context
  const authStore = getContext<AuthStore>('auth');
  
  if (!authStore) {
    throw new Error('UserProfile must be used within an AuthProvider');
  }

  // Props
  let { 
    showLogoutButton = true,
    onLogout 
  } = $props<{
    showLogoutButton?: boolean;
    onLogout?: () => void;
  }>();

  // Handle logout
  async function handleLogout() {
    await authStore.logout();
    if (onLogout) {
      onLogout();
    }
  }

  // Get user initials for avatar
  function getUserInitials(name?: string, email?: string): string {
    if (name) {
      return name
        .split(' ')
        .map(part => part.charAt(0))
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    
    if (email) {
      return email.charAt(0).toUpperCase();
    }
    
    return 'U';
  }

  let userInitials = $derived(
    authStore.user ? getUserInitials(authStore.user.name, authStore.user.email) : 'U'
  );
</script>

{#if authStore.user}
  <div class="flex items-center space-x-3">
    <!-- User Avatar -->
    <div class="flex-shrink-0">
      <div class="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center">
        <span class="text-sm font-medium text-white">
          {userInitials}
        </span>
      </div>
    </div>
    
    <!-- User Info -->
    <div class="flex-1 min-w-0">
      {#if authStore.user.name}
        <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
          {authStore.user.name}
        </p>
        <p class="text-sm text-gray-500 dark:text-gray-400 truncate">
          {authStore.user.email}
        </p>
      {:else}
        <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
          {authStore.user.email}
        </p>
      {/if}
    </div>
    
    <!-- Logout Button -->
    {#if showLogoutButton}
      <div class="flex-shrink-0">
        <button
          type="button"
          onclick={handleLogout}
          disabled={authStore.isLoading}
          class="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-gray-700 bg-gray-100 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        >
          {#if authStore.isLoading}
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          {:else}
            <svg class="-ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          {/if}
          Sign out
        </button>
      </div>
    {/if}
  </div>
{:else}
  <div class="flex items-center space-x-3">
    <div class="flex-shrink-0">
      <div class="h-8 w-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
        <svg class="h-5 w-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
    </div>
    <div class="flex-1 min-w-0">
      <p class="text-sm text-gray-500 dark:text-gray-400">
        Not signed in
      </p>
    </div>
  </div>
{/if}
