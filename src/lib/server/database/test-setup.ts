import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock SvelteKit's env module so server-side imports don't crash in tests.
// Every variable `src/env.ts` declares is here; `ADMIN_USER_ID` is the
// optional one, and empty is what a deployment that has not set it sees.
vi.mock('$app/env/private', () => ({
	SUPABASE_URL: 'https://test.supabase.co',
	SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
	BASIC_BEARER_TOKEN: 'test-basic-bearer-token',
	ADMIN_USER_ID: ''
}));

// `getRequestEvent` throws outside a request. Server helpers that read it are
// written to treat that as "no request context", and this keeps the throw
// realistic rather than letting the module fail to resolve at all.
vi.mock('$app/server', () => ({
	getRequestEvent: () => {
		throw new Error('getRequestEvent called outside a request');
	}
}));
