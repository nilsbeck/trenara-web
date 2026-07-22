/**
 * Map a training block type string to a display colour.
 * Shared between the training detail list and treadmill mode so
 * block colours stay consistent across views.
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
