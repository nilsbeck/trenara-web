import { describe, it, expect } from 'vitest';
import { buildExport } from './normalize';
import { blocksCsv, entriesCsv, sessionsCsv, weeksCsv } from './tables';
import { makeSchedule, makeTraining } from '../../test-utils/plan-fixtures';

const plan = buildExport([makeSchedule()], {
	from: '2026-09-02',
	to: '2026-12-06',
	goal: null,
	timezone: 'Europe/Berlin',
	source: 'test',
	includeRaw: false,
	now: new Date(2026, 8, 2)
});

/** Header plus rows, split on the newline the writer ends every file with. */
function rows(csv: string): string[] {
	return csv.trim().split('\n');
}

describe('sessionsCsv', () => {
	it('writes one row per session under a stable header', () => {
		const lines = rows(sessionsCsv(plan));
		expect(lines).toHaveLength(2);
		expect(lines[0].startsWith('date,training_week,id,title')).toBe(true);
	});

	it('keeps the machine number beside its human twin', () => {
		const line = rows(sessionsCsv(plan))[1];
		expect(line).toContain('4068');
		expect(line).toContain('1:07:48');
	});

	it('carries the applied intensity, which no single upstream field holds', () => {
		expect(rows(sessionsCsv(plan))[1]).toContain('98');
	});

	it('quotes a description holding a comma so the row keeps its shape', () => {
		const withComma = buildExport(
			[makeSchedule({ trainings: [makeTraining({ description: 'Run, then rest' })] })],
			{
				from: '2026-09-02',
				to: '2026-12-06',
				goal: null,
				timezone: 'UTC',
				source: 'test',
				includeRaw: false
			}
		);
		expect(sessionsCsv(withComma)).toContain('"Run, then rest"');
	});
});

describe('blocksCsv', () => {
	it('writes one row per block across every session', () => {
		const lines = rows(blocksCsv(plan));
		expect(lines).toHaveLength(5); // header + four blocks
	});

	it('addresses each block by its dotted path and its session', () => {
		const lines = rows(blocksCsv(plan));
		expect(lines[1]).toContain('127477832');
		expect(lines.some((line) => line.includes(',2.1,'))).toBe(true);
	});

	it('leaves a rest block empty rather than zero in the distance column', () => {
		const rest = rows(blocksCsv(plan)).find((line) => line.includes(',2.2,'));
		expect(rest).toContain('Rest 2:00');
		expect(rest).not.toContain(',0,');
	});
});

describe('entriesCsv', () => {
	it('writes one row per logged activity, with pace in both forms', () => {
		const lines = rows(entriesCsv(plan));
		expect(lines).toHaveLength(2);
		expect(lines[1]).toContain('336');
		expect(lines[1]).toContain('5:36');
	});
});

describe('weeksCsv', () => {
	it('writes one row per week, keyed by the Monday', () => {
		const lines = rows(weeksCsv(plan));
		expect(lines).toHaveLength(2);
		expect(lines[1].startsWith('2026-08-31,12,')).toBe(true);
	});
});
