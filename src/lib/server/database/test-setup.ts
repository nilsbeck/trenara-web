import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock SvelteKit virtual env modules so server-side imports don't crash in tests.
vi.mock('$env/static/private', () => ({
	SUPABASE_URL: 'https://test.supabase.co',
	SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
	BASIC_BEARER_TOKEN: 'test-basic-bearer-token',
	TRENARA_API_URL: 'https://api.test.trenara.com'
}));
