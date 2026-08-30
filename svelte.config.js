import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			runtime: 'nodejs22.x',
			/**
			 * How long the platform will wait before killing the function.
			 *
			 * Stated rather than inherited, because `DEFAULT_BUDGET_MS` in
			 * `$lib/server/trenara/client` is chosen to sit "well inside the
			 * function's own limit" — and until this was set, what that limit
			 * actually was depended on plan defaults nobody had checked. The two
			 * numbers are a pair: 15s here against a 9s request budget leaves room
			 * for the several upstream calls a page load runs in parallel, plus the
			 * render, without the retry logic ever being cut off mid-backoff.
			 */
			maxDuration: 15
		}),
		csp: {
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'https:', 'data:'],
				// Only this app's own origin. Trenara used to be listed here, which
				// granted an origin nothing uses: every upstream call is made from
				// `+server.ts`, and the browser never talks to Trenara directly.
				'connect-src': ['self'],
				'font-src': ['self'],
				'frame-ancestors': ['none'],
				// Unset, these three fall back to `default-src` or to nothing at all
				// depending on the directive, so they are worth stating: no plugins,
				// no rewriting the document base, and forms may only post to this app.
				'object-src': ['none'],
				'base-uri': ['self'],
				'form-action': ['self']
			}
		}
	}
};

export default config;
