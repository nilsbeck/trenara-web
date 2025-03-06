<script lang="ts">
	import '../../app.css';
	import Loading from '$lib/components/loading.svelte';
	import type { User } from '$lib/server/api/types';
	import type { LayoutServerData } from './$types';
	let { children, data }: { children: any, data: LayoutServerData } = $props();
</script>

<div class="navbar bg-base-100">
	<div class="flex-1">
		{#await data.userData}
			<Loading />
		{:then userData}
			<h1>Hi, {(userData as User).first_name}!</h1>
		{:catch error}
			<p>Could not load user data! {error}</p>
		{/await}
	</div>
	<div class="flex-none">
	  <div class="dropdown dropdown-end">
		<div tabindex="0" role="button" class="btn btn-ghost btn-circle">
		  <div class="indicator">
			<svg
			  xmlns="http://www.w3.org/2000/svg"
			  class="h-5 w-5"
			  fill="none"
			  viewBox="0 0 24 24"
			  stroke="currentColor">
			  <path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
			</svg>
			<span class="badge badge-sm indicator-item">8</span>
		  </div>
		</div>
		<!-- <div
		  class="card card-compact dropdown-content bg-base-100 z-[1] mt-3 w-52 shadow">
		  <div class="card-body">
			<span class="text-lg font-bold">8 Items</span>
			<span class="text-info">Subtotal: $999</span>
			<div class="card-actions">
			  <button class="btn btn-primary btn-block">View cart</button>
			</div>
		  </div>
		</div> -->
	  </div>
	  {#await data.userData}
		<Loading />
	  {:then userData}
	  	{#await import('$lib/components/icon-menu.svelte') then { default: IconMenu }}
			<IconMenu userData={(userData as User)} />
		{/await}
	  {/await}
	</div>
</div>

<div class="content">
	{@render children()}
</div>

<footer class="footer sm:footer-horizontal footer-center text-base-content p-4">
</footer>
