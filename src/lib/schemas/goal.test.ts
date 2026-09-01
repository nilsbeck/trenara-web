import { describe, it, expect } from 'vitest';
import { pauseGoalSchema } from './goal';

describe('pauseGoalSchema', () => {
	it('accepts a reason with no follow-up, defaulting the text to empty', () => {
		const parsed = pauseGoalSchema.parse({ type: 'illness' });
		expect(parsed).toEqual({ type: 'illness', extraInput: '' });
	});

	it('keeps the follow-up when there is one', () => {
		const parsed = pauseGoalSchema.parse({ type: 'other', extraInput: 'Moving house.' });
		expect(parsed.extraInput).toBe('Moving house.');
	});

	// The served list is the source of truth for which reasons exist. A reason
	// added upstream must reach this endpoint rather than be refused here.
	it('accepts a reason no captured list knows about', () => {
		expect(pauseGoalSchema.safeParse({ type: 'sabbatical' }).success).toBe(true);
	});

	it('refuses an empty reason', () => {
		expect(pauseGoalSchema.safeParse({ type: '' }).success).toBe(false);
	});

	it('refuses a missing reason', () => {
		expect(pauseGoalSchema.safeParse({ extraInput: 'why' }).success).toBe(false);
	});

	it('refuses a follow-up past the sanity bound', () => {
		expect(pauseGoalSchema.safeParse({ type: 'other', extraInput: 'x'.repeat(1001) }).success).toBe(
			false
		);
	});

	it('refuses a reason that is not a string', () => {
		expect(pauseGoalSchema.safeParse({ type: 4 }).success).toBe(false);
	});
});
