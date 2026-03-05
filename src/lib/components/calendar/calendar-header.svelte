<script lang="ts">
	import { getContext } from 'svelte';
	import type { CalendarStore } from '$lib/stores/calendar.svelte';
	import CalendarNavigation from './calendar-navigation.svelte';

	const store = getContext<CalendarStore>('calendar');

	const MONTH_NAMES = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
	];

	const title = $derived(
		`${MONTH_NAMES[store.currentDate.getMonth()]} ${store.currentDate.getFullYear()}`
	);
</script>

<div class="flex items-center justify-between mb-4">
	<h2 class="text-lg font-semibold text-foreground">{title}</h2>
	<CalendarNavigation />
</div>
