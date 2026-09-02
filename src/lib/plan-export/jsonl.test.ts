import { describe, it, expect } from 'vitest';
import { buildExport } from './normalize';
import { toJsonl } from './jsonl';
import { makeEntry, makeSchedule, makeTraining } from '../../test-utils/plan-fixtures';

const options = {
	from: '2026-09-02',
	to: '2026-12-06',
	goal: null,
	timezone: 'Europe/Berlin',
	source: 'test',
	includeRaw: false,
	now: new Date(2026, 8, 2)
};

const plan = buildExport([makeSchedule()], options);

/** Every line parsed back, which is the only assertion that matters here. */
function parse(jsonl: string): Record<string, unknown>[] {
	return jsonl
		.trim()
		.split('\n')
		.map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('toJsonl', () => {
	it('ends with a newline, so appending or concatenating cannot fuse two records', () => {
		expect(toJsonl(plan).endsWith('\n')).toBe(true);
	});

	it('puts exactly one parseable record on every line', () => {
		const records = parse(toJsonl(plan));
		expect(records).toHaveLength(4); // meta, one week, one session, one entry
		expect(records.every((record) => typeof record.record === 'string')).toBe(true);
	});

	it('leads with meta, and folds the goal into it', () => {
		const goal = {
			id: 5,
			name: 'Valencia Marathon',
			start_date: '2026-06-01',
			end_date: '2026-12-06',
			distance_value: 42.195,
			distance_unit: 'km'
		} as Parameters<typeof buildExport>[1]['goal'];
		const [first] = parse(toJsonl(buildExport([makeSchedule()], { ...options, goal })));
		expect(first.record).toBe('meta');
		expect(first.from).toBe('2026-09-02');
		expect((first.goal as { name: string }).name).toBe('Valencia Marathon');
	});

	it('writes each kind in a stable order, so two exports diff cleanly', () => {
		expect(parse(toJsonl(plan)).map((record) => record.record)).toEqual([
			'meta',
			'week',
			'session',
			'entry'
		]);
	});

	it('keeps a session whole, blocks included, so nothing has to be joined back', () => {
		const session = parse(toJsonl(plan)).find((record) => record.record === 'session');
		expect(session?.title).toBe('Endurance run');
		expect((session?.blocks as unknown[]).map((block) => (block as { path: string }).path)).toEqual(
			['1', '2', '2.1', '2.2']
		);
	});

	it('survives a description holding a newline, which would otherwise split the line', () => {
		const multiline = buildExport(
			[makeSchedule({ trainings: [makeTraining({ description: 'Warm up.\nThen run.' })] })],
			options
		);
		const records = parse(toJsonl(multiline));
		expect(records.filter((record) => record.record === 'session')).toHaveLength(1);
		expect(records.find((record) => record.record === 'session')?.description).toBe(
			'Warm up.\nThen run.'
		);
	});

	it('omits the raw payloads when the export carries none', () => {
		expect(parse(toJsonl(plan)).some((record) => record.record === 'raw_week')).toBe(false);
	});

	it('writes the raw payloads last, indexed, when the export carries them', () => {
		const schedule = makeSchedule();
		const withRaw = buildExport([schedule], { ...options, includeRaw: true });
		const records = parse(toJsonl(withRaw));
		expect(records[records.length - 1]).toMatchObject({ record: 'raw_week', index: 0 });
		expect(records[records.length - 1].payload).toEqual(schedule);
	});

	it('writes a strength session as its own record', () => {
		const strength = {
			id: 77,
			title: 'Core stability',
			training_type: 'strength',
			description: '',
			day: '2026-09-03',
			exercises: [{ id: 1, name: 'Plank' }],
			accessories: []
		};
		const withStrength = buildExport(
			[makeSchedule({ strength_trainings: [strength as never], entries: [] })],
			options
		);
		const record = parse(toJsonl(withStrength)).find((row) => row.record === 'strength');
		expect(record?.exercises).toEqual(['Plank']);
	});

	it('writes an entry record per logged activity', () => {
		const twoRuns = buildExport(
			[makeSchedule({ entries: [makeEntry({ id: 1 }), makeEntry({ id: 2 })] })],
			options
		);
		expect(parse(toJsonl(twoRuns)).filter((record) => record.record === 'entry')).toHaveLength(2);
	});

	it('writes an export with nothing in range as a meta line alone', () => {
		const empty = buildExport([], options);
		expect(parse(toJsonl(empty)).map((record) => record.record)).toEqual(['meta']);
	});
});
