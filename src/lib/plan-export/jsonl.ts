import type { PlanExport } from './normalize';

/**
 * The export as newline-delimited JSON: one file, one record per line.
 *
 * This is the format that actually gets analysed. A session is a nested thing —
 * it has blocks — and flattening it into CSV either loses the blocks or
 * repeats the session across a row per block; the JSON tree keeps it whole but
 * has to be loaded and walked before anything can be filtered. A line per
 * record is both: `jq 'select(.record == "session")'` and
 * `pandas.read_json(lines=True)` each read it without a parser of their own,
 * and a session line carries its own blocks so nothing has to be joined back.
 *
 * Records are discriminated by `record` rather than split across files, since
 * the point of the format is that there is one file. They are written in the
 * order below, which is stable — a diff of two exports lines up.
 */
export type PlanRecordKind = 'meta' | 'week' | 'session' | 'strength' | 'entry' | 'raw_week';

/**
 * One record, with `record` first so a line says what it is before it says
 * anything else — these get read in a terminal as often as by a program.
 */
function line(record: PlanRecordKind, body: Record<string, unknown>): string {
	// JSON.stringify escapes newlines inside strings, so a description holding
	// one cannot break the line discipline this format depends on.
	return JSON.stringify({ record, ...body });
}

export function toJsonl(plan: PlanExport): string {
	const lines: string[] = [
		line('meta', { ...plan.meta, goal: plan.goal }),
		...plan.weeks.map((week) => line('week', { ...week })),
		...plan.sessions.map((session) => line('session', { ...session })),
		...plan.strength.map((strength) => line('strength', { ...strength })),
		...plan.entries.map((entry) => line('entry', { ...entry })),
		// The untouched payloads last: they are the bulk of the file and the
		// least often read, so everything worth scanning stays near the top.
		...(plan.raw ?? []).map((week, index) => line('raw_week', { index, payload: week }))
	];

	return lines.join('\n') + '\n';
}
