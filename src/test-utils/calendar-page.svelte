<!--
	The dashboard's relationship to the calendar, and nothing else of it.

	`+page.svelte` hands the calendar `data.schedule`, and SvelteKit hands the
	page a new `data` object whenever *any* load above it re-runs — the layout's
	`invalidate('app:news')` included — even though the page's own load did not
	run and `data.schedule` is the very same object as before. Mounting the
	calendar bare cannot show that; this wrapper can, by being re-rendered with a
	fresh `data` around an unchanged schedule.
-->
<script lang="ts">
	import Calendar from '$lib/components/calendar/calendar.svelte';
	import type { Schedule } from '$lib/server/trenara/types';

	let { data, today }: { data: { schedule: Schedule; badge?: number }; today: Date } = $props();
</script>

<Calendar {today} schedule={data.schedule} />
