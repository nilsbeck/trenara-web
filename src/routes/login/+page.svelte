<script lang='ts'>
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';
	import logo from '/src/assets/trenara-logo.png';

	let formLoading = $state(false);

	let { form }: { form: ActionData } = $props();
</script>

<div class="flex min-h-full flex-col justify-center px-6 py-12 lg:px-8">
	<div class="sm:mx-auto sm:w-full sm:max-w-sm">
		<img class="mx-auto h-10 w-auto" src={logo} alt="Trenara" style="width: 150px; height: 150px;">
		<h2 class="mt-10 text-center text-2xl/9 font-bold tracking-tight">Sign in to your account</h2>
	</div>
	
	<div class="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
		<form class="space-y-6" action='?/login' method="POST" use:enhance={() => {
			formLoading = true;
			return async ({ update }) => {
				formLoading = false;
				update();
			};
		}}>
		<div>
			<label for="username" class="block text-sm/6 font-medium">Username</label>
			<div class="mt-2">
			<input type="email" name="username" id="username" autocomplete="username" required class="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6">
			</div>
		</div>
	
		<div>
			<div class="flex items-center justify-between">
			<label for="password" class="block text-sm/6 font-medium">Password</label>
			<!-- <div class="text-sm">
				<a href="#" class="font-semibold text-indigo-600 hover:text-indigo-500">Forgot password?</a>
			</div> -->
			</div>
			<div class="mt-2">
			<input type="password" name="password" id="password" autocomplete="current-password" required class="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6">
			</div>
		</div>
	
		<div>
			<button type="submit" class="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"> 
				{#if formLoading}
					<svg class="mr-3 -ml-1 size-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
				{:else}
					Sign in
				{/if}
			</button>
		</div>
		</form>
	
		<!-- <p class="mt-10 text-center text-sm/6 text-gray-500">
		Not a member?
		<a href="#" class="font-semibold text-indigo-600 hover:text-indigo-500">Start a 14 day free trial</a>
		</p> -->
	</div>
</div>

