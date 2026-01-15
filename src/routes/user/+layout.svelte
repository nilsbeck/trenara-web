<script lang="ts">
	import '../../app.css';
	import Loading from '$lib/components/loading.svelte';
	import ChatBubble from '$lib/components/ChatBubble.svelte';
	import type { User } from '$lib/server/api/types';
	import type { LayoutServerData } from './$types';
	import AddTrainingModal from '$lib/components/modals/addTrainingModal.svelte';
	let { children, data }: { children: any; data: LayoutServerData } = $props();

	
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
	<div class="flex flex-row space-x-2">
		<AddTrainingModal/>
		{#await data.userData}
			<Loading />
		{:then userData}
			{#await import('$lib/components/icon-menu.svelte') then { default: IconMenu }}
				<IconMenu userData={userData as User} />
			{/await}
		{/await}
	</div>
</div>

<div class="content">
	{@render children()}
</div>

<footer class="footer sm:footer-horizontal footer-center text-base-content p-4"></footer>

<!-- Chat Bubble - appears on all authenticated pages -->
<ChatBubble />
