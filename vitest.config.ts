import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],
	// Component tests mount into jsdom, so Svelte has to resolve to its client
	// build rather than the SSR one it picks by default under Node.
	resolve: { conditions: ['browser'] },
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		environment: 'jsdom',
		globals: true,
		setupFiles: ['src/lib/server/database/test-setup.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: ['node_modules/', 'src/test-utils/', '**/*.d.ts', '**/*.config.*', '**/coverage/**'],
			/**
			 * Floors, and this time they are actually floors.
			 *
			 * These were inert twice over. Nothing ever ran `test:coverage` — not
			 * the `test` script, not CI — so they gated nothing; and they were
			 * nested under a `global` key, which is the old c8 shape that Vitest
			 * does not read, so even when run the suite passed with branches at
			 * 75.9% against a stated 80. CI runs coverage now, and these are flat.
			 *
			 * Set just under where the suite actually stands (81.2 / 75.9 / 81.5 /
			 * 84.0) rather than at the aspirational 80 across the board: a
			 * threshold that fails on the day it is introduced teaches everyone to
			 * ignore it. They are a ratchet against regression — raise them as
			 * coverage rises, starting with branches, which is the weakest.
			 */
			thresholds: {
				statements: 80,
				branches: 75,
				functions: 80,
				lines: 83
			}
		}
	}
});
