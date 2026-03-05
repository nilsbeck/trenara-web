export function formatTime(timeString: string): string {
	const parts = timeString.split(':');
	if (parts.length === 2) return timeString + 'min';
	return timeString + 'h';
}

export function formatPace(paceString: string): string {
	return paceString;
}

/**
 * Convert time string (HH:MM:SS or H:MM:SS) to total seconds.
 */
export function timeStringToSeconds(timeStr: string): number {
	const parts = timeStr.split(':').map(Number);
	if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
	if (parts.length === 2) return parts[0] * 60 + parts[1];
	return 0;
}

/**
 * Convert pace string (MM:SS or "MM:SS min/km") to seconds per km.
 */
export function paceStringToSeconds(paceStr: string): number {
	const clean = paceStr.replace(/\s*min\/km\s*/, '').trim();
	const parts = clean.split(':').map(Number);
	if (parts.length === 2) return parts[0] * 60 + parts[1];
	return 0;
}

/**
 * Convert seconds back to HH:MM:SS.
 */
export function secondsToTimeString(totalSeconds: number): string {
	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	const s = Math.floor(totalSeconds % 60);
	return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Convert seconds per km back to MM:SS.
 */
export function secondsToPaceString(totalSeconds: number): string {
	const m = Math.floor(totalSeconds / 60);
	const s = Math.floor(totalSeconds % 60);
	return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Format an ISO date string as "Mon DD" (short month + day).
 */
export function formatDateShort(dateStr: string): string {
	const d = new Date(dateStr);
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
