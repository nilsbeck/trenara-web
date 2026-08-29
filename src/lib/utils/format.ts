/**
 * What a value that cannot be shown reads as.
 *
 * The same hyphen the session tables already print for a figure a training
 * does not carry, so a value that failed to parse looks like the absence it is
 * rather than like a different kind of problem.
 */
export const NO_VALUE = '-';

/**
 * One field of a clock string, as a number — or null if it is not one.
 *
 * `Number` is too generous to lean on here: it reads `""` and `"  "` as 0 and
 * `"1e3"` as a thousand, so a blank or a decorative `"--:--"` would come back
 * as a time rather than as no time at all.
 */
function clockPart(part: string): number | null {
	if (!/^\d+(\.\d+)?$/.test(part.trim())) return null;
	const value = Number(part);
	return Number.isFinite(value) ? value : null;
}

/** Sum the fields of a clock string against `multipliers`, or null if any is not a number. */
function clockSeconds(value: string | null | undefined, multipliers: number[]): number | null {
	if (typeof value !== 'string') return null;

	const parts = value.split(':');
	if (parts.length !== multipliers.length) return null;

	let total = 0;
	for (let i = 0; i < parts.length; i++) {
		const field = clockPart(parts[i]);
		if (field === null) return null;
		total += field * multipliers[i];
	}
	return total;
}

/**
 * Whatever the API sent for a time, as something that can be shown.
 *
 * Total on purpose. This app reads a reverse-engineered API whose fields are
 * typed from captured traffic, so a `string` here is a description of what has
 * been seen rather than a guarantee — a null for an account with no runs yet,
 * or a `"--:--"` placeholder, is the kind of thing that arrives without notice.
 * Left to `String.split` that was a thrown TypeError halfway through rendering,
 * which takes down the whole page over one absent figure.
 */
export function formatTime(timeString: string | null | undefined): string {
	if (typeof timeString !== 'string' || !timeString.trim()) return NO_VALUE;
	return timeString.split(':').length === 2 ? `${timeString}min` : `${timeString}h`;
}

export function formatPace(paceString: string | null | undefined): string {
	if (typeof paceString !== 'string' || !paceString.trim()) return NO_VALUE;
	return paceString;
}

/**
 * Convert time string (HH:MM:SS or H:MM:SS) to total seconds.
 *
 * Anything unparsable is 0 — a missing field, a placeholder, or a value that is
 * not a clock at all. That is the contract everything downstream was written
 * against ("a malformed time reaches here as a zero", in `race-equivalent`):
 * `usablePoints` drops a zero and carries on with the rows that did parse,
 * where a NaN would spread through a curve and surface as `NaN:NaN:NaN` on
 * screen. It used to return NaN for `"--:--"` and throw outright on a null.
 */
export function timeStringToSeconds(timeStr: string | null | undefined): number {
	return clockSeconds(timeStr, [3600, 60, 1]) ?? clockSeconds(timeStr, [60, 1]) ?? 0;
}

/**
 * Convert pace string (MM:SS or "MM:SS min/km") to seconds per km.
 *
 * Unparsable is 0, as above — and 0 is what every caller already checks for,
 * since a pace of zero is not a pace.
 */
export function paceStringToSeconds(paceStr: string | null | undefined): number {
	if (typeof paceStr !== 'string') return 0;
	const clean = paceStr.replace(/\s*min\/(km|mi)\s*/, '').trim();
	return clockSeconds(clean, [60, 1]) ?? 0;
}

/**
 * Whether a number is one a clock can actually be written from.
 *
 * A negative duration is as unrenderable as a NaN: the arithmetic below turns
 * −5 seconds into `-1:59:55`, which is not a shorter time or a longer one but
 * a nonsense. Signed differences are `formatSignedDuration`'s job.
 */
function isShowableDuration(seconds: number | null | undefined): seconds is number {
	return typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0;
}

/**
 * Convert seconds back to HH:MM:SS.
 *
 * A value that is not a duration reads as {@link NO_VALUE}. It used to render
 * as `NaN:NaN:NaN`, which is how a single unparsed figure from the API
 * announced itself in the middle of a chart axis.
 */
export function secondsToTimeString(totalSeconds: number): string {
	if (!isShowableDuration(totalSeconds)) return NO_VALUE;

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
	if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return NO_VALUE;

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
	if (!isShowableDuration(totalSeconds)) return NO_VALUE;

	const m = Math.floor(totalSeconds / 60);
	const s = Math.floor(totalSeconds % 60);
	return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Format an ISO date string as "Mon DD" (short month + day).
 *
 * A date the browser cannot read formats as the literal words "Invalid Date",
 * which is worse than a blank on a chart axis — it is long enough to push the
 * labels around it out of place.
 */
export function formatDateShort(dateStr: string | null | undefined): string {
	if (typeof dateStr !== 'string') return NO_VALUE;

	const d = new Date(dateStr);
	if (Number.isNaN(d.getTime())) return NO_VALUE;

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
 * Seconds as a clock time, without an hour field when there isn't an hour.
 *
 * `secondsToTimeString` always leads with the hour, which reads wrong on a
 * distance short enough not to have one: a 5 km prediction is 19:29, not
 * 0:19:29.
 */
export function secondsToDuration(totalSeconds: number): string {
	if (!isShowableDuration(totalSeconds)) return NO_VALUE;

	const rounded = Math.round(totalSeconds);
	const h = Math.floor(rounded / 3600);
	const m = Math.floor((rounded % 3600) / 60);
	const s = rounded % 60;
	return h > 0
		? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
		: `${m}:${String(s).padStart(2, '0')}`;
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
