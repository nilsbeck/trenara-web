import { describe, it, expect } from 'vitest';
import {
	formatTime,
	formatPace,
	timeStringToSeconds,
	paceStringToSeconds,
	secondsToTimeString,
	secondsToPaceString,
	formatDateShort
} from './format';

// ─────────────────────────────────────────────────────────────
// formatTime
// ─────────────────────────────────────────────────────────────
describe('formatTime', () => {
	it('appends "min" to MM:SS strings (2 parts)', () => {
		expect(formatTime('45:00')).toBe('45:00min');
	});

	it('appends "h" to HH:MM:SS strings (3 parts)', () => {
		expect(formatTime('1:30:00')).toBe('1:30:00h');
	});

	it('handles zero-padded MM:SS', () => {
		expect(formatTime('05:30')).toBe('05:30min');
	});

	it('handles single-digit hour HH:MM:SS', () => {
		expect(formatTime('2:05:00')).toBe('2:05:00h');
	});
});

// ─────────────────────────────────────────────────────────────
// formatPace
// ─────────────────────────────────────────────────────────────
describe('formatPace', () => {
	it('returns the pace string unchanged', () => {
		expect(formatPace('5:30')).toBe('5:30');
	});

	it('passes through pace with units unchanged', () => {
		expect(formatPace('4:15 min/km')).toBe('4:15 min/km');
	});
});

// ─────────────────────────────────────────────────────────────
// timeStringToSeconds
// ─────────────────────────────────────────────────────────────
describe('timeStringToSeconds', () => {
	it('converts HH:MM:SS correctly', () => {
		expect(timeStringToSeconds('1:30:00')).toBe(5400);
	});

	it('converts H:MM:SS with single-digit hour', () => {
		expect(timeStringToSeconds('2:05:30')).toBe(7530);
	});

	it('converts MM:SS (2-part) correctly', () => {
		expect(timeStringToSeconds('45:30')).toBe(2730);
	});

	it('returns 0 for a single part', () => {
		expect(timeStringToSeconds('60')).toBe(0);
	});

	it('returns 0 for empty string', () => {
		expect(timeStringToSeconds('')).toBe(0);
	});

	it('handles 0:00:00', () => {
		expect(timeStringToSeconds('0:00:00')).toBe(0);
	});

	it('handles large hour values', () => {
		expect(timeStringToSeconds('10:00:00')).toBe(36000);
	});

	it('is the inverse of secondsToTimeString', () => {
		const original = '3:45:15';
		expect(secondsToTimeString(timeStringToSeconds(original))).toBe(original);
	});
});

// ─────────────────────────────────────────────────────────────
// paceStringToSeconds
// ─────────────────────────────────────────────────────────────
describe('paceStringToSeconds', () => {
	it('converts plain MM:SS pace', () => {
		expect(paceStringToSeconds('5:30')).toBe(330);
	});

	it('strips " min/km" suffix', () => {
		expect(paceStringToSeconds('5:30 min/km')).toBe(330);
	});

	it('strips "min/km" without leading space', () => {
		expect(paceStringToSeconds('4:45min/km')).toBe(285);
	});

	it('returns 0 for single part (no colon)', () => {
		expect(paceStringToSeconds('330')).toBe(0);
	});

	it('returns 0 for empty string', () => {
		expect(paceStringToSeconds('')).toBe(0);
	});

	it('handles zero pace', () => {
		expect(paceStringToSeconds('0:00')).toBe(0);
	});

	it('is the inverse of secondsToPaceString for plain strings', () => {
		const original = '5:09';
		expect(secondsToPaceString(paceStringToSeconds(original))).toBe(original);
	});
});

// ─────────────────────────────────────────────────────────────
// secondsToTimeString
// ─────────────────────────────────────────────────────────────
describe('secondsToTimeString', () => {
	it('converts 0 seconds', () => {
		expect(secondsToTimeString(0)).toBe('0:00:00');
	});

	it('converts exactly one hour', () => {
		expect(secondsToTimeString(3600)).toBe('1:00:00');
	});

	it('pads minutes and seconds with leading zeros', () => {
		expect(secondsToTimeString(3661)).toBe('1:01:01');
	});

	it('converts sub-minute seconds', () => {
		expect(secondsToTimeString(45)).toBe('0:00:45');
	});

	it('handles large values', () => {
		expect(secondsToTimeString(36000)).toBe('10:00:00');
	});

	it('truncates fractional seconds', () => {
		expect(secondsToTimeString(90.9)).toBe('0:01:30');
	});
});

// ─────────────────────────────────────────────────────────────
// secondsToPaceString
// ─────────────────────────────────────────────────────────────
describe('secondsToPaceString', () => {
	it('converts 0 seconds', () => {
		expect(secondsToPaceString(0)).toBe('0:00');
	});

	it('converts 5 minutes', () => {
		expect(secondsToPaceString(300)).toBe('5:00');
	});

	it('pads seconds with leading zero', () => {
		expect(secondsToPaceString(309)).toBe('5:09');
	});

	it('converts 330 seconds to 5:30', () => {
		expect(secondsToPaceString(330)).toBe('5:30');
	});

	it('handles values under 1 minute', () => {
		expect(secondsToPaceString(45)).toBe('0:45');
	});

	it('truncates fractional seconds', () => {
		expect(secondsToPaceString(330.9)).toBe('5:30');
	});
});

// ─────────────────────────────────────────────────────────────
// formatDateShort
// ─────────────────────────────────────────────────────────────
describe('formatDateShort', () => {
	it('formats a January date', () => {
		expect(formatDateShort('2025-01-05')).toBe('Jan 5');
	});

	it('formats a December date', () => {
		expect(formatDateShort('2025-12-31')).toBe('Dec 31');
	});

	it('formats a mid-year date', () => {
		expect(formatDateShort('2025-06-15')).toBe('Jun 15');
	});

	it('does not include the year', () => {
		const result = formatDateShort('2025-03-20');
		expect(result).not.toMatch(/2025/);
	});
});
