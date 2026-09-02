import { describe, it, expect } from 'vitest';
import { generateShareToken, isShareToken } from './token';

describe('generateShareToken', () => {
	it('is 43 characters of the base64url alphabet, unpadded', () => {
		const token = generateShareToken();
		expect(token).toHaveLength(43);
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});

	it('is distinct across many draws', () => {
		const tokens = new Set(Array.from({ length: 1000 }, () => generateShareToken()));
		expect(tokens.size).toBe(1000);
	});
});

describe('isShareToken', () => {
	it('accepts an issued token', () => {
		expect(isShareToken(generateShareToken())).toBe(true);
	});

	it('rejects the wrong length', () => {
		expect(isShareToken('a'.repeat(42))).toBe(false);
		expect(isShareToken('a'.repeat(44))).toBe(false);
		expect(isShareToken('')).toBe(false);
	});

	it('rejects characters outside the base64url alphabet', () => {
		expect(isShareToken('+'.repeat(43))).toBe(false);
		expect(isShareToken('/'.repeat(43))).toBe(false);
		expect(isShareToken('='.repeat(43))).toBe(false);
		expect(isShareToken('a'.repeat(42) + ' ')).toBe(false);
	});

	it('rejects a path-traversal attempt of the same length', () => {
		expect(isShareToken('../../../../../../../../../../../../../../../etc')).toBe(false);
	});
});
