import { describe, it, expect } from 'vitest';
import { loginSchema } from './auth';

// ─────────────────────────────────────────────────────────────
// loginSchema
// ─────────────────────────────────────────────────────────────
describe('loginSchema', () => {
	const valid = { username: 'user@example.com', password: 'secret123' };

	it('accepts valid credentials', () => {
		expect(loginSchema.safeParse(valid).success).toBe(true);
	});

	it('rejects non-email username', () => {
		expect(loginSchema.safeParse({ ...valid, username: 'notanemail' }).success).toBe(false);
	});

	it('rejects empty username', () => {
		expect(loginSchema.safeParse({ ...valid, username: '' }).success).toBe(false);
	});

	it('rejects empty password', () => {
		expect(loginSchema.safeParse({ ...valid, password: '' }).success).toBe(false);
	});

	it('rejects missing fields', () => {
		expect(loginSchema.safeParse({}).success).toBe(false);
		expect(loginSchema.safeParse({ username: 'a@b.com' }).success).toBe(false);
		expect(loginSchema.safeParse({ password: 'x' }).success).toBe(false);
	});
});
