import type { TrainingBlock } from '#lib/server/trenara/types.js';
import { hexColor } from './hex-color';

/**
 * The colour a block is drawn in, wherever it is drawn: the shape bar under
 * the session's title, the plan in the training details, and treadmill mode.
 *
 * Trenara sends its own colour with every block, `hex_graph`, and it is the
 * pace zone rather than the kind of block — a 04:13 step and a 05:06–05:29
 * step in the same tempo run are both typed `run`, and the coach draws one red
 * and the other blue. That is the colour to use. The shape bar always did,
 * while the plan below it guessed from the type alone and painted both steps
 * yellow, so the two disagreed on every session with more than one pace.
 *
 * The type is only the fallback, for a block that arrives without a colour.
 *
 * The value goes through `hexColor` first, as every upstream colour does on
 * its way into a `style` attribute.
 */
export function blockColor(block: Pick<TrainingBlock, 'type' | 'hex_graph'>): string {
	return hexColor(block.hex_graph) ?? blockTypeColor(block.type);
}

/**
 * Map a training block type string to a display colour.
 *
 * A guess from the type, for a block that carries no colour of its own — use
 * `blockColor` for a block, which prefers the coach's.
 */
export function blockTypeColor(type: string | undefined): string {
	if (!type) return '#60a5fa';
	const t = type.toLowerCase();
	if (t.includes('warm') || t.includes('cool')) return '#60a5fa'; // blue
	if (t === 'run' || t === 'easy' || t === 'jog') return '#facc15'; // yellow
	if (t === 'tempo' || t === 'fast' || t === 'threshold') return '#f97316'; // orange
	if (t === 'interval' || t === 'rep') return '#a855f7'; // purple
	if (t === 'rest' || t === 'recovery' || t === 'walk') return '#94a3b8'; // slate
	if (t === 'block') return '#4ade80'; // green
	return '#60a5fa'; // default blue
}
