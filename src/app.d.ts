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
