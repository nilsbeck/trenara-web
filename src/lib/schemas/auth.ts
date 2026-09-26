import { z } from 'zod';

// Ceilings, not product rules: 254 is the longest address SMTP can carry, and
// no password manager emits anything near 1024. They exist so a pathological
// body is refused by the schema rather than forwarded to Trenara.
export const loginSchema = z.object({
	username: z.string().max(254).email('Please enter a valid email address'),
	password: z.string().min(1, 'Password is required').max(1024)
});
