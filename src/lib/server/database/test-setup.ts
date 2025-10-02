/**
 * Test setup for database tests
 * Configures environment and mocks for testing
 */

import { beforeAll, afterAll } from 'vitest';

// Mock environment variables for testing
beforeAll(() => {
	// Set test environment
	process.env.NODE_ENV = 'test';
	
	// Mock database URL if not provided
	if (!process.env.POSTGRES_URL) {
		process.env.POSTGRES_URL = 'postgres://test:test@localhost:5432/test';
	}
});

afterAll(() => {
	// Cleanup after tests
});
