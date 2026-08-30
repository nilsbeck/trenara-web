import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock SvelteKit virtual env modules so server-side imports don't crash in tests.
vi.mock('$env/static/private', () => ({
	SUPABASE_URL: 'https://test.supabase.co',
	SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
	BASIC_BEARER_TOKEN: 'test-basic-bearer-token',
	TRENARA_API_URL: 'https://api.test.trenara.com'
}));

// Dynamic env is read for optional settings only, so an empty bag is the
// realistic default: it is what a deployment that has set none of them sees.
vi.mock('$env/dynamic/private', () => ({ env: {} }));

// `getRequestEvent` throws outside a request. Server helpers that read it are
// written to treat that as "no request context", and this keeps the throw
// realistic rather than letting the module fail to resolve at all.
vi.mock('$app/server', () => ({
	getRequestEvent: () => {
		throw new Error('getRequestEvent called outside a request');
	}
}));
