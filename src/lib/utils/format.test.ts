import { describe, it, expect } from 'vitest';
import {
	formatTime,
	formatPace,
	timeStringToSeconds,
	paceStringToSeconds,
	secondsToTimeString,
	secondsToPaceString,
	formatDateShort,
	paceToKmh,
	formatSpeedKmh
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

// ─────────────────────────────────────────────────────────────
// paceToKmh
// ─────────────────────────────────────────────────────────────
describe('paceToKmh', () => {
	it('converts a decimal min/km pace to km/h', () => {
		// 4.5 min/km = 4:30/km -> 60 / 4.5 = 13.33... km/h
		expect(paceToKmh(4.5, 'min/km')).toBeCloseTo(13.333, 2);
	});

	it('converts a "MM:SS" pace string to km/h', () => {
		// 5:00/km -> 12 km/h
		expect(paceToKmh('5:00', 'min/km')).toBeCloseTo(12, 5);
	});

	it('converts a "MM:SS min/km" pace string to km/h', () => {
		expect(paceToKmh('6:00 min/km', 'min/km')).toBeCloseTo(10, 5);
	});

	it('applies the mile-to-km conversion for min/mi paces', () => {
		// 8:03/mi ~ 5:00/km, so this should be close to 12 km/h
		expect(paceToKmh(8.05, 'min/mi')).toBeCloseTo(11.99, 1);
	});

	it('returns null for a zero decimal pace', () => {
		expect(paceToKmh(0, 'min/km')).toBeNull();
	});

	it('returns null for a negative decimal pace', () => {
		expect(paceToKmh(-1, 'min/km')).toBeNull();
	});

	it('returns null for an unparsable pace string', () => {
		expect(paceToKmh('rest', 'min/km')).toBeNull();
	});

	it('returns null for an empty pace string', () => {
		expect(paceToKmh('', 'min/km')).toBeNull();
	});

	it('treats a missing unit as km', () => {
		expect(paceToKmh(5)).toBeCloseTo(12, 5);
	});
});

// ─────────────────────────────────────────────────────────────
// formatSpeedKmh
// ─────────────────────────────────────────────────────────────
describe('formatSpeedKmh', () => {
	it('formats a speed to one decimal place with a km/h suffix', () => {
		expect(formatSpeedKmh(13.333)).toBe('13.3 km/h');
	});

	it('rounds to the nearest tenth', () => {
		expect(formatSpeedKmh(12)).toBe('12.0 km/h');
	});

	it('returns null for null input', () => {
		expect(formatSpeedKmh(null)).toBeNull();
	});

	it('returns null for undefined input', () => {
		expect(formatSpeedKmh(undefined)).toBeNull();
	});

	it('returns null for zero', () => {
		expect(formatSpeedKmh(0)).toBeNull();
	});

	it('returns null for a negative speed', () => {
		expect(formatSpeedKmh(-5)).toBeNull();
	});
});
