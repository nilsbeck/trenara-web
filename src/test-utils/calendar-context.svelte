<!--
	One part of the calendar, mounted under a store the way `calendar.svelte`
	hands its own down.

	The context key belongs to `createContext` and is private, so a test can no
	longer pass the store in by name through `render`'s `context` map; it sets
	it here instead, through the same setter the calendar uses.
-->
<script lang="ts">
	import { untrack, type Component } from 'svelte';
	import { setCalendarStore, type CalendarStore } from '#lib/stores/calendar.svelte.js';

	let { store, part: Part }: { store: CalendarStore; part: Component } = $props();

	setCalendarStore(untrack(() => store));
</script>

<Part />
