/**
 * CSV for the flat views of the export.
 *
 * The JSON is the faithful copy; these are for dropping into a spreadsheet or a
 * `diff` next to another plan. One file per grain — sessions, blocks, entries —
 * because a session and a block cannot share a row without one of them being
 * repeated into nonsense.
 */

/**
 * One CSV field, quoted whenever it could otherwise change the shape of the row.
 *
 * Null and undefined become empty rather than the strings "null"/"undefined":
 * an absent distance must read as absent to whatever loads this, not as a value.
 */
export function csvCell(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (Array.isArray(value)) return csvCell(value.join('; '));
	const text = String(value);
	return /["\n\r,]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Rows keyed by the given columns, header first, CRLF-free. */
export function toCsv<T extends Record<string, unknown>>(columns: string[], rows: T[]): string {
	const lines = [columns.map(csvCell).join(',')];
	for (const row of rows) {
		lines.push(columns.map((column) => csvCell(row[column])).join(','));
	}
	return lines.join('\n') + '\n';
}

/** `3599` → `59:59`; `3600` → `1:00:00`. Null passes through as empty. */
export function formatDuration(seconds: number | null | undefined): string {
	if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '';
	const total = Math.round(seconds);
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const secs = total % 60;
	const mm = String(minutes).padStart(hours > 0 ? 2 : 1, '0');
	return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(secs).padStart(2, '0')}`;
}

/** Seconds per km as `m:ss`, the form a runner reads a pace in. */
export function formatPace(secondsPerKm: number | null | undefined): string {
	if (typeof secondsPerKm !== 'number' || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) {
		return '';
	}
	return formatDuration(secondsPerKm);
}
