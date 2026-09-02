import { describe, it, expect } from 'vitest';
import { csvCell, formatDuration, formatPace, toCsv } from './csv';

describe('csvCell', () => {
	it('leaves an ordinary value bare', () => {
		expect(csvCell('endurance')).toBe('endurance');
		expect(csvCell(12.09)).toBe('12.09');
		expect(csvCell(false)).toBe('false');
	});

	it('quotes a value holding a comma, so it stays one field', () => {
		expect(csvCell('Run 4km, then rest')).toBe('"Run 4km, then rest"');
	});

	it('doubles an embedded quote, which is how CSV escapes one', () => {
		expect(csvCell('the "core" set')).toBe('"the ""core"" set"');
	});

	it('quotes a value holding a newline, so it stays one row', () => {
		expect(csvCell('two\nlines')).toBe('"two\nlines"');
	});

	it('writes an absent value as empty, never as the word null', () => {
		expect(csvCell(null)).toBe('');
		expect(csvCell(undefined)).toBe('');
	});

	it('joins a list rather than rendering it as [object Object]', () => {
		expect(csvCell(['Plank', 'Bridge'])).toBe('Plank; Bridge');
	});
});

describe('toCsv', () => {
	it('writes the header from the columns, in order', () => {
		const csv = toCsv(['date', 'km'], [{ date: '2026-09-02', km: 12 }]);
		expect(csv.split('\n')[0]).toBe('date,km');
	});

	it('picks columns by name, ignoring extra keys on the row', () => {
		const csv = toCsv(['km'], [{ date: '2026-09-02', km: 12 }]);
		expect(csv).toBe('km\n12\n');
	});

	it('leaves a column a row does not carry empty', () => {
		const csv = toCsv(['km', 'rpe'], [{ km: 12 }]);
		expect(csv.split('\n')[1]).toBe('12,');
	});

	it('writes a header and nothing else for no rows', () => {
		expect(toCsv(['km'], [])).toBe('km\n');
	});
});

describe('formatDuration', () => {
	it('writes under an hour as m:ss', () => {
		expect(formatDuration(3599)).toBe('59:59');
		expect(formatDuration(120)).toBe('2:00');
	});

	it('writes an hour or more as h:mm:ss', () => {
		expect(formatDuration(3600)).toBe('1:00:00');
		expect(formatDuration(4068)).toBe('1:07:48');
	});

	it('is empty for an absent duration, not 0:00', () => {
		expect(formatDuration(null)).toBe('');
		expect(formatDuration(undefined)).toBe('');
		expect(formatDuration(Number.NaN)).toBe('');
	});

	it('writes a zero duration as 0:00, which is a real value', () => {
		expect(formatDuration(0)).toBe('0:00');
	});
});

describe('formatPace', () => {
	it('writes seconds per km as m:ss', () => {
		expect(formatPace(346)).toBe('5:46');
	});

	it('is empty for a pace that is absent or nonsensical', () => {
		expect(formatPace(null)).toBe('');
		expect(formatPace(0)).toBe('');
		expect(formatPace(-10)).toBe('');
	});
});
