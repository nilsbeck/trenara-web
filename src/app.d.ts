// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Error {
			message: string;
			/**
			 * Set when the failure was the connection to Trenara rather than
			 * anything this app decided, so the error page can offer a retry
			 * instead of apologising for a bug.
			 */
			unreachable?: boolean;
			/**
			 * Set when the failure was this app's own database rather than
			 * Trenara. The two are different servers, and a runner told
			 * "Trenara is not answering" when it is the history table that is
			 * down has been pointed at the wrong one.
			 */
			storage?: boolean;
			/**
			 * Present when Trenara refused for rate limiting. Carries what this
			 * app was sending in the run-up, so the error page can show it and
			 * the maintainer can send it on without reading a server log.
			 */
			rateLimit?: import('#lib/server/trenara/rate-limit.js').RateLimitDiagnostic;
		}

		interface Locals {
			user: {
				id: number;
				email: string;
			} | null;
			/**
			 * Where this request's server time goes, written out as
			 * `Server-Timing` (`#lib/server/timing`). Absent outside a real
			 * request — a load called from a test — so read it through `timed`.
			 */
			timing?: import('#lib/server/timing.js').Timing;
			/**
			 * The dashboard's Trenara reads, when `handleAuth` started them beside
			 * the identity check (`startsDashboardEarly` in `hooks.server.ts`). The
			 * dashboard's load uses these rather than asking again.
			 */
			dashboardReads?: import('#lib/server/dashboard/reads.js').DashboardReads;
		}
	}
}

export {};
