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
		}

		interface Locals {
			user: {
				id: number;
				email: string;
			} | null;
		}
	}
}

export {};
