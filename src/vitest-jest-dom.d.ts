/**
 * jest-dom's matchers (`toBeInTheDocument`, `toBeEnabled`, …) on Vitest 5's
 * `expect`.
 *
 * Vitest 5 takes custom matchers on `Matchers<R, T>`, and `Assertion` now has
 * two type parameters. jest-dom 7.0.1 — the latest release — still augments
 * the old one-parameter `Assertion<T>`, which no longer merges: the matchers
 * are registered at runtime by `import '@testing-library/jest-dom'` in the
 * test setup and every test passes, but `bun run check` rejects each call.
 * This declares them where Vitest 5 looks. Delete it once jest-dom ships a
 * `vitest.d.ts` that augments `Matchers`.
 */
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
	// Empty by design: the matchers are what it inherits. The type parameters
	// must match Vitest's own declaration exactly for the two to merge, and
	// `T` is part of that even though jest-dom's matchers do not use it.
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- merges into Vitest's Matchers
	interface Matchers<
		R extends void | Promise<void> = void | Promise<void>,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- must match Vitest's declaration
		T = unknown
	> extends TestingLibraryMatchers<unknown, R> {}
}
