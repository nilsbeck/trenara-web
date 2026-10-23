import { defineEnvVars } from '@sveltejs/kit/env';

/**
 * Every environment variable the app reads, and nothing else (agents.md §9,
 * Platform edges). A new one goes here, into `.env.example`, into the CI
 * placeholders in `check.yml` and into the mock in
 * `src/lib/server/database/test-setup.ts`.
 *
 * The three credentials are static: inlined into the server build, which is
 * what `$env/static/private` did before SvelteKit 3, and they never reach a
 * client bundle — `$app/env/private` is refused outside server code.
 *
 * `ADMIN_USER_ID` is read at runtime and optional. Unset, it falls back to the
 * empty string, which `isDiagnosticViewer` reads as `Number('') === 0` — no
 * Trenara id — so nobody is shown the rate-limit snapshot. That is the
 * intended default, not an accident of the fallback.
 */
export const variables = defineEnvVars({
	BASIC_BEARER_TOKEN: { static: true },
	ADMIN_USER_ID: { schema: (input) => input ?? '' },
	SUPABASE_URL: { static: true },
	SUPABASE_SERVICE_ROLE_KEY: { static: true }
});
