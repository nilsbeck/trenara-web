import { describe, it, expect } from 'vitest';
import { hexColor, trainingColor, NO_SESSION_COLOR } from './hex-color';

describe('hexColor', () => {
	it('passes a hex colour through', () => {
		expect(hexColor('#E69F00')).toBe('#E69F00');
		expect(hexColor('#fff')).toBe('#fff');
		expect(hexColor('#ffff')).toBe('#ffff');
		expect(hexColor('#44A6D380')).toBe('#44A6D380');
	});

	it('trims what surrounds it', () => {
		expect(hexColor('  #E69F00 ')).toBe('#E69F00');
	});

	it('refuses anything else, so it cannot add a declaration to a style', () => {
		expect(hexColor('red; background-image: url(https://x.test/a)')).toBeNull();
		expect(hexColor('#E69F00; color: red')).toBeNull();
		expect(hexColor('red')).toBeNull();
		expect(hexColor('#12345')).toBeNull();
		expect(hexColor('E69F00')).toBeNull();
		expect(hexColor('')).toBeNull();
		expect(hexColor(null)).toBeNull();
		expect(hexColor(undefined)).toBeNull();
	});
});

describe('trainingColor', () => {
	it("uses the session's own colour", () => {
		expect(trainingColor({ hex_training: '#E69F00' })).toBe('#E69F00');
	});

	it('draws a neutral colour where the session has none worth drawing', () => {
		expect(trainingColor({ hex_training: 'red; x: y' })).toBe(NO_SESSION_COLOR);
		expect(trainingColor({ hex_training: '' })).toBe(NO_SESSION_COLOR);
	});
});
