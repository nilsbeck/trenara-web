import { describe, it, expect } from 'vitest';
import { sendMessageSchema, chatMarkReadSchema } from './chat';

describe('sendMessageSchema', () => {
	it('accepts a message and leaves its whitespace alone', () => {
		const result = sendMessageSchema.safeParse({ content: '  Easy run today?  ' });
		expect(result.success).toBe(true);
		expect(result.data?.content).toBe('  Easy run today?  ');
	});

	it.each([
		['an empty string', ''],
		['whitespace only', '   \n'],
		['a number', 42],
		['a message past the ceiling', 'x'.repeat(10_001)],
		['nothing', undefined]
	])('rejects %s', (_label, content) => {
		expect(sendMessageSchema.safeParse({ content }).success).toBe(false);
	});
});

describe('chatMarkReadSchema', () => {
	it.each([0, 101])('accepts %i', (lastSeenMessageId) => {
		expect(chatMarkReadSchema.safeParse({ lastSeenMessageId }).success).toBe(true);
	});

	it.each([
		['a negative id', -1],
		['a fraction', 1.5],
		['a numeric string', '101'],
		['nothing', undefined]
	])('rejects %s', (_label, lastSeenMessageId) => {
		expect(chatMarkReadSchema.safeParse({ lastSeenMessageId }).success).toBe(false);
	});
});
