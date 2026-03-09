<script lang="ts">
	import type { ScheduledTraining } from '$lib/server/trenara/types';
	import { CalendarDays, ChevronLeft, ChevronRight, X, Loader2, TriangleAlert } from 'lucide-svelte';

	let {
		training,
		selectedDate,
		onMoved
	}: {
		training: ScheduledTraining;
		selectedDate: string | null;
		onMoved?: () => void;
	} = $props();

	let dialogEl: HTMLDialogElement | undefined = $state();
	let pickerDate = $state(new Date());
	let changeToDate = $state<Date | null>(null);
	let submitting = $state(false);
	let error = $state<string | null>(null);
	let warning = $state<string | null>(null);

	// Parse the original training date for highlighting
	const originalDate = $derived.by(() => {
		if (!selectedDate) return null;
		const [y, m, d] = selectedDate.split('-').map(Number);
		return new Date(y, m - 1, d);
	});

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	function open() {
		changeToDate = null;
		error = null;
		warning = null;
		// Start the picker on the month of the training
		if (originalDate) {
			pickerDate = new Date(originalDate.getFullYear(), originalDate.getMonth(), 1);
		} else {
			pickerDate = new Date();
		}
		dialogEl?.showModal();
	}

	function close() {
		dialogEl?.close();
	}

	function prevMonth() {
		const d = new Date(pickerDate);
		d.setMonth(d.getMonth() - 1);
		pickerDate = d;
	}

	function nextMonth() {
		const d = new Date(pickerDate);
		d.setMonth(d.getMonth() + 1);
		pickerDate = d;
	}

	const pickerTitle = $derived(
		pickerDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
	);

	const calendarDays = $derived.by(() => {
		const year = pickerDate.getFullYear();
		const month = pickerDate.getMonth();
		const firstDay = new Date(year, month, 1);
		const lastDay = new Date(year, month + 1, 0);
		const startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0

		const days: Array<{
			date: Date;
			dayNumber: number;
			isCurrentMonth: boolean;
			isToday: boolean;
			isSelected: boolean;
			isOriginal: boolean;
			isPast: boolean;
		}> = [];

		// Previous month padding
		const prevLast = new Date(year, month, 0);
		for (let i = startOffset - 1; i >= 0; i--) {
			const d = new Date(year, month - 1, prevLast.getDate() - i);
			days.push({
				date: d,
				dayNumber: d.getDate(),
				isCurrentMonth: false,
				isToday: false,
				isSelected: false,
				isOriginal: false,
				isPast: true
			});
		}

		// Current month
		for (let day = 1; day <= lastDay.getDate(); day++) {
			const d = new Date(year, month, day);
			d.setHours(0, 0, 0, 0);
			days.push({
				date: d,
				dayNumber: day,
				isCurrentMonth: true,
				isToday: d.getTime() === today.getTime(),
				isSelected: changeToDate ? d.getTime() === changeToDate.getTime() : false,
				isOriginal: originalDate ? d.getTime() === originalDate.getTime() : false,
				isPast: d < today
			});
		}

		// Next month padding to fill 6 rows
		const remaining = 42 - days.length;
		for (let day = 1; day <= remaining; day++) {
			const d = new Date(year, month + 1, day);
			days.push({
				date: d,
				dayNumber: day,
				isCurrentMonth: false,
				isToday: false,
				isSelected: false,
				isOriginal: false,
				isPast: false
			});
		}

		return days;
	});

	async function handleTest() {
		if (!changeToDate) return;

		submitting = true;
		error = null;
		warning = null;

		const y = changeToDate.getFullYear();
		const m = String(changeToDate.getMonth() + 1).padStart(2, '0');
		const d = String(changeToDate.getDate()).padStart(2, '0');
		const newDate = `${y}-${m}-${d}T00:00:00.000Z`;

		try {
			const testRes = await fetch('/api/v1/training/move', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					entryId: training.id,
					newDate,
					includeFuture: false,
					action: 'test'
				})
			});

			if (testRes.ok) {
				const data = await testRes.json();
				if (data.goal_possible === false) {
					const hours = Math.floor(data.new_goal_time / 3600);
					const mins = Math.floor((data.new_goal_time % 3600) / 60);
					const secs = data.new_goal_time % 60;
					const newTime = `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
					warning = `Your goal time would change to ${newTime}. Do you want to continue?`;
					return;
				}
			} else if (testRes.status >= 400 && testRes.status < 500) {
				// Goal-related rejection from the backend — treat as a warning the user can override
				const data = await testRes.json().catch(() => ({}));
				warning = data.message ?? 'This change may affect your goal. Do you want to continue?';
				return;
			} else {
				// Backend test endpoint error — treat as warning since save may still work
				const data = await testRes.json().catch(() => ({}));
				warning = data.message ?? 'Could not verify this change. Do you want to continue?';
				return;
			}

			// Test passed with goal_possible — proceed to save directly
			await saveMove(newDate);
		} catch (e) {
			error = e instanceof Error ? e.message : 'An unexpected error occurred';
		} finally {
			submitting = false;
		}
	}

	async function saveMove(newDate?: string) {
		if (!changeToDate) return;

		submitting = true;
		error = null;

		const date = newDate ?? (() => {
			const y = changeToDate.getFullYear();
			const m = String(changeToDate.getMonth() + 1).padStart(2, '0');
			const d = String(changeToDate.getDate()).padStart(2, '0');
			return `${y}-${m}-${d}T00:00:00.000Z`;
		})();

		try {
			const saveRes = await fetch('/api/v1/training/move', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					entryId: training.id,
					newDate: date,
					includeFuture: false,
					action: 'save'
				})
			});

			if (!saveRes.ok) {
				const data = await saveRes.json().catch(() => ({}));
				throw new Error(data.message ?? `Failed to save date change (${saveRes.status})`);
			}

			close();
			onMoved?.();
		} catch (e) {
			error = e instanceof Error ? e.message : 'An unexpected error occurred';
		} finally {
			submitting = false;
		}
	}
</script>

<button
	type="button"
	onclick={open}
	class="rounded-md p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
	aria-label="Change date"
>
	<CalendarDays class="h-5 w-5" />
</button>

<dialog
	bind:this={dialogEl}
	class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm rounded-lg border border-border bg-card p-0 shadow-xl backdrop:bg-black/50"
	onclick={(e) => { if (e.target === dialogEl) close(); }}
>
	<div class="p-6">
		<!-- Header -->
		<div class="flex items-center justify-between mb-2">
			<h2 class="text-lg font-semibold text-card-foreground">Move Training</h2>
			<button
				type="button"
				onclick={close}
				class="rounded-md p-1 text-muted-foreground hover:text-card-foreground"
			>
				<X class="h-5 w-5" />
			</button>
		</div>

		<p class="text-sm text-muted-foreground mb-4">
			Select a new date. If a training is already scheduled, they will be swapped.
		</p>

		<!-- Calendar Picker -->
		<div class="rounded-lg border border-border bg-muted/30 p-3">
			<!-- Month navigation -->
			<div class="flex items-center justify-between mb-3">
				<button
					type="button"
					onclick={prevMonth}
					class="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
				>
					<ChevronLeft class="h-4 w-4" />
				</button>
				<span class="text-sm font-semibold text-foreground">{pickerTitle}</span>
				<button
					type="button"
					onclick={nextMonth}
					class="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
				>
					<ChevronRight class="h-4 w-4" />
				</button>
			</div>

			<!-- Weekday headers -->
			<div class="grid grid-cols-7 gap-0 mb-1">
				{#each ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as day}
					<div class="py-1 text-center text-xs font-medium text-muted-foreground">{day}</div>
				{/each}
			</div>

			<!-- Day grid -->
			<div class="grid grid-cols-7 gap-0">
				{#each calendarDays as day}
					<button
						type="button"
						class="flex aspect-square items-center justify-center rounded-md text-xs transition-colors"
						class:text-foreground={day.isCurrentMonth && !day.isPast}
						class:text-muted-foreground={!day.isCurrentMonth || day.isPast}
						class:opacity-40={!day.isCurrentMonth}
						class:cursor-not-allowed={day.isPast || !day.isCurrentMonth}
						class:font-semibold={day.isToday || day.isSelected || day.isOriginal}
						class:bg-primary={day.isSelected}
						class:text-primary-foreground={day.isSelected}
						class:ring-2={day.isOriginal && !day.isSelected}
						class:ring-primary={day.isOriginal && !day.isSelected}
						class:bg-muted={day.isToday && !day.isSelected}
						class:hover:bg-muted={day.isCurrentMonth && !day.isPast && !day.isSelected}
						disabled={day.isPast || !day.isCurrentMonth}
						onclick={() => {
							if (!day.isPast && day.isCurrentMonth) {
								changeToDate = day.date;
							}
						}}
					>
						{day.dayNumber}
					</button>
				{/each}
			</div>
		</div>

		{#if error}
			<p class="mt-4 text-sm text-destructive">{error}</p>
		{/if}

		{#if warning}
			<div class="mt-4 flex items-start gap-2 rounded-md bg-yellow-500/10 border border-yellow-500/30 p-3">
				<TriangleAlert class="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
				<p class="text-sm text-yellow-500">{warning}</p>
			</div>
		{/if}

		<!-- Actions -->
		<div class="flex items-center justify-end gap-3 mt-4">
			<button
				type="button"
				onclick={close}
				class="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-card-foreground transition-colors"
			>
				Cancel
			</button>
			{#if warning}
				<button
					type="button"
					disabled={submitting}
					onclick={() => saveMove()}
					class="inline-flex items-center gap-2 rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-500 disabled:opacity-50 transition-colors"
				>
					{#if submitting}
						<Loader2 class="h-4 w-4 animate-spin" />
						Moving...
					{:else}
						Move Anyway
					{/if}
				</button>
			{:else}
				<button
					type="button"
					disabled={!changeToDate || submitting}
					onclick={handleTest}
					class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
				>
					{#if submitting}
						<Loader2 class="h-4 w-4 animate-spin" />
						Moving...
					{:else}
						Move Training
					{/if}
				</button>
			{/if}
		</div>
	</div>
</dialog>
