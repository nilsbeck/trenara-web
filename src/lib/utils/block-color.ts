import type { TrainingBlock } from '#lib/server/trenara/types.js';

/**
 * The colour a block is drawn in, wherever it is drawn: the shape bar under
 * the session's title, the plan in the training details, and treadmill mode.
 *
 * By the kind of step, from the app's own palette (`--color-block-*` in
 * `app.css`) — easy running either side of the work, the running itself, and
 * the rests between it. Trenara also sends a pace-zone colour per block
 * (`hex_graph`), and the shape bar drew from that for a while; it was the more
 * detailed scale, but it put red and green on a card whose red already means
 * "missed" and green "done", and the list below the bar drew by kind anyway.
 * One scale, everywhere: this one.
 *
 * Returned as a custom property, so the hue lives in the theme with the rest
 * of the palette and works inside a `style` attribute or `color-mix` alike.
 */
export function blockColor(block: Pick<TrainingBlock, 'type'>): string {
	return `var(--color-block-${blockKind(block.type)})`;
}

type BlockKind = 'easy' | 'run' | 'rest';

/**
 * Captured traffic has only ever carried `warmup`, `run`, `rest` and
 * `cooldown` on a step (`core` is a group, drawn through its steps). The other
 * spellings are matched for safety, not because they have been seen.
 */
function blockKind(type: string | undefined): BlockKind {
	const t = (type ?? '').toLowerCase();
	if (t.includes('warm') || t.includes('cool')) return 'easy';
	if (t === 'rest' || t === 'recovery' || t === 'walk') return 'rest';
	// A step we do not recognise is most likely another running step — and a
	// cycling session's block is typed `run` too (see `TrainingBlock.type`).
	return 'run';
}
