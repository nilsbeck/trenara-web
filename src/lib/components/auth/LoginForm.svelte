<script lang="ts">
  import { getContext } from 'svelte';
  import type { AuthStore, LoginCredentials } from '$lib/types/index.js';
  
  // Get auth store from context
  const authStore = getContext<AuthStore>('auth');
  
  if (!authStore) {
    throw new Error('LoginForm must be used within an AuthProvider');
  }

  // Form state
  let email = $state('');
  let password = $state('');
  let showPassword = $state(false);

  // Form validation
  let isFormValid = $derived(
    email.trim().length > 0 && 
    password.length > 0 && 
    email.includes('@')
  );

  // Handle form submission
  async function handleSubmit(event: Event) {
    event.preventDefault();
    
    if (!isFormValid) return;

    const credentials: LoginCredentials = {
      email: email.trim(),
      password
    };

    const result = await authStore.login(credentials);
    
    if (result.success) {
      // Login successful - parent component can handle redirect
      console.log('Login successful');
    } else {
      // Error is already set in the store
      console.error('Login failed:', result.error?.message);
    }
  }

  // Clear error when user starts typing
  $effect(() => {
    if (email || password) {
      authStore.clearError();
    }
  });
</script>

<form onsubmit={handleSubmit} class="space-y-4">
  <div>
    <label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
      Email
    </label>
    <input
      id="email"
      type="email"
      bind:value={email}
      required
      autocomplete="email"
      class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
      placeholder="Enter your email"
    />
  </div>

  <div>
    <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
      Password
    </label>
    <div class="relative">
      <input
        id="password"
        type={showPassword ? 'text' : 'password'}
        bind:value={password}
        required
        autocomplete="current-password"
        class="mt-1 block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        placeholder="Enter your password"
      />
      <button
        type="button"
        class="absolute inset-y-0 right-0 pr-3 flex items-center"
        onclick={() => showPassword = !showPassword}
      >
        {#if showPassword}
          <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        {:else}
          <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
          </svg>
        {/if}
      </button>
    </div>
  </div>

  {#if authStore.error}
    <div class="bg-red-50 border border-red-200 rounded-md p-3">
      <div class="flex">
        <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
        </svg>
        <div class="ml-3">
          <p class="text-sm text-red-800">
            {authStore.error.message}
          </p>
        </div>
      </div>
    </div>
  {/if}

  <button
    type="submit"
    disabled={!isFormValid || authStore.isLoading}
    class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {#if authStore.isLoading}
      <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Signing in...
    {:else}
      Sign in
    {/if}
  </button>
</form>
