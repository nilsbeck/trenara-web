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
 * A difference in seconds, signed, at whatever scale reads best.
 *
 * `+7:12` for seven minutes behind, `−45s` for forty-five seconds ahead. The
 * sign is the point — a gap that reads the same in both directions tells a
 * runner nothing — so it is always shown, and a true zero is `even` rather than
 * a signed nothing.
 */
export function formatSignedDuration(seconds: number): string {
	const rounded = Math.round(seconds);
	if (rounded === 0) return 'even';

	const sign = rounded > 0 ? '+' : '−';
	const abs = Math.abs(rounded);
	if (abs < 60) return `${sign}${abs}s`;

	const h = Math.floor(abs / 3600);
	const m = Math.floor((abs % 3600) / 60);
	const s = abs % 60;
	return h > 0
		? `${sign}${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
		: `${sign}${m}:${String(s).padStart(2, '0')}`;
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

/**
 * Convert a running pace to a speed in km/h.
 *
 * Accepts either a pace string ("4:30" / "4:30 min/km") or a decimal
 * minutes-per-unit value (e.g. 4.5 meaning 4:30). When `unit` indicates
 * miles ("min/mi"), the result is converted to km/h accordingly.
 *
 * Returns null when the pace is missing, zero, or unparsable — treadmills
 * have no use for a "0 km/h" instruction (e.g. rest blocks).
 */
export function paceToKmh(pace: string | number, unit?: string): number | null {
	let secondsPerUnit: number;

	if (typeof pace === 'number') {
		if (!isFinite(pace) || pace <= 0) return null;
		secondsPerUnit = pace > 40 ? pace : pace * 60;
	} else {
		secondsPerUnit = paceStringToSeconds(pace);
		if (!secondsPerUnit) return null;
	}

	// Only look at the distance-unit segment (after the "/"), since "min/km"
	// itself contains the substring "mi" (from "min") and would otherwise
	// be misdetected as miles.
	const distanceUnit = (unit ?? '').toLowerCase().split('/')[1] ?? '';
	const isMiles = distanceUnit.startsWith('mi');
	const kmh = 3600 / secondsPerUnit;
	return isMiles ? kmh * 1.60934 : kmh;
}

/**
 * Format a speed in km/h for display, e.g. "13.3 km/h".
 * Returns null for missing/invalid speeds so callers can skip rendering.
 */
export function formatSpeedKmh(kmh: number | null | undefined): string | null {
	if (kmh == null || !isFinite(kmh) || kmh <= 0) return null;
	return `${kmh.toFixed(1)} km/h`;
}

/**
 * "5:16 min/km" -> "5:16 /km".
 *
 * The goal card's collapsed head gives the countdown and the prediction one
 * line between them, and on a 390px screen the three characters of "min" are
 * the difference between two lines and three. The card's own forecast row
 * already writes a pace this way, so this is the house spelling rather than
 * one invented here.
 *
 * A suffix swap rather than a hardcoded "/km", because the unit follows the
 * account: an imperial runner gets "min/mi", and keeps it.
 */
export function shortenPaceUnit(pace: string): string {
	return pace.replace(/\bmin\//, '/');
}
