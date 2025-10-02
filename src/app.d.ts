// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import { SessionData } from '$lib/server/auth/session-manager';

declare global {
	namespace App {
        interface Locals {
          user: {
            id: string;
            email: string;
          } | null;
          session: SessionData | null;
        }

    }
}

export {};
