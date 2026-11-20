<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** The goal card and what folds with it. */
		cards: Snippet;
		calendar: Snippet;
	}

	let { cards, calendar }: Props = $props();
</script>

<!--
	The dashboard's two columns, without what goes in them.

	Its own component because two things draw it: the dashboard, and the launch
	placeholder (`src/routes/launch`) that stands in for it on a slow start.
	The placeholder's cards are replaced by the real ones in one step, so they
	have to sit in exactly the columns the real ones will — the same wrappers,
	not a copy of them that the next fix to this layout would miss.
-->
<!--
	Side by side at `lg`, not `md`. Both columns are 28rem, so the pair needs
	920px before the gap — more than the 768px `md` was letting them try, which
	pushed the second column off the side of the viewport.
-->
<div class="flex flex-col items-center justify-center lg:flex-row">
	<!--
		`gap` rather than `lg:space-x-6`: the columns stack until `lg`, and a
		horizontal-only rule left the cards sitting flush against the calendar at
		every width below it. One gap covers both directions.

		`max-w-full` here and on the calendar's wrapper below: each is a flex item
		in a column aligned to the start or centre, which sizes it to its content —
		the columns' 28rem — so the columns' own `max-w-full` resolved against
		448px and capped nothing. On a 390px phone the calendar overflowed and was
		clipped on both sides, Sunday off the edge of the week.
	-->
	<div class="flex max-w-full flex-col items-start justify-center gap-6 lg:flex-row">
		<!--
			The goal column leads the source and steps behind the calendar from
			`lg` up.

			`lg` and not `sm`, because `lg` is where the columns actually split.
			Below it they are stacked however wide the window is, and ordering the
			goal column second there drops it under a full month grid — off the
			bottom of a tablet exactly as it would be off the bottom of a phone.
			Whenever the cards sit above the calendar they lead, and they fold.

			That the cards lead is the whole point of the stack: a month grid and
			its day detail fill the screen, so anything below the calendar is as
			far out of reach as it was in the menu. Source order rather than
			`order` alone, so they are also the first thing a keyboard or a screen
			reader meets — the same argument. The cost is that from `lg` up both
			land on the cards before the calendar; there the two are side-by-side
			peers, and the mismatch is worth the narrow screen.

			The width is definite, matching the calendar. Without one this column
			is sized by its content, which means by the widest thing the cards
			happen to contain — and lines up with the calendar only by chance.
		-->
		<div class="w-[28rem] min-w-0 max-w-full lg:order-2">
			{@render cards()}
		</div>

		<div class="flex max-w-full flex-col items-center lg:order-1 lg:flex-row">
			{@render calendar()}
		</div>
	</div>
</div>
