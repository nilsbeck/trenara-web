import { describe, it, expect } from 'vitest';
import { intelligenceParagraphs } from './intelligence';

// Transcribed from a week capture of 2026-10-07, escapes decoded.
const CAPTURED =
	'I’ve adjusted your training, Nils. Based on your recent (mechanical) running load, there seems to be room to safely extend the original distance of 10km for this workout. The new distance of 11km is therefore a little longer, while remaining within our safe limits.\n\nNot feeling quite as good today? You can still shorten the workout a little.\n';

describe('intelligenceParagraphs', () => {
	it('splits the captured note into its two paragraphs', () => {
		expect(intelligenceParagraphs({ has_intelligence: true, intelligence_text: CAPTURED })).toEqual(
			[
				'I’ve adjusted your training, Nils. Based on your recent (mechanical) running load, there seems to be room to safely extend the original distance of 10km for this workout. The new distance of 11km is therefore a little longer, while remaining within our safe limits.',
				'Not feeling quite as good today? You can still shorten the workout a little.'
			]
		);
	});

	it('returns null when intelligence is switched off', () => {
		expect(intelligenceParagraphs({ has_intelligence: false, intelligence_text: null })).toBeNull();
	});

	it('returns null on a payload that predates the field', () => {
		expect(intelligenceParagraphs({})).toBeNull();
		expect(intelligenceParagraphs(null)).toBeNull();
	});

	it('does not trust text without the flag', () => {
		expect(
			intelligenceParagraphs({ has_intelligence: false, intelligence_text: CAPTURED })
		).toBeNull();
	});

	it('returns null when the flag is on but there is nothing to say', () => {
		expect(intelligenceParagraphs({ has_intelligence: true, intelligence_text: null })).toBeNull();
		expect(
			intelligenceParagraphs({ has_intelligence: true, intelligence_text: ' \n\n ' })
		).toBeNull();
	});

	it('handles CRLF line endings', () => {
		expect(
			intelligenceParagraphs({ has_intelligence: true, intelligence_text: 'One.\r\n\r\nTwo.' })
		).toEqual(['One.', 'Two.']);
	});
});
