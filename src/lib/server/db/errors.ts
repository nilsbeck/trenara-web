import { error } from '@sveltejs/kit';

/**
 * A storage call that did not do what it was asked.
 *
 * Every DAO used to answer a failed query the same way it answers an empty
 * one — `[]`, `null`, `{ stored: false }` — and log the reason to a console
 * nobody reads. That is not degrading gracefully, it is stating something
 * false: "you have archived no goals" is a claim about the runner's history,
 * and an unreachable database is not entitled to make it.
 *
 * So the ones whose answer the runner is shown now say when they could not
 * answer at all. The ones whose failure genuinely is harmless still swallow
 * it, and say why where they do — see `NewsReadStateDAO.getMark`.
 */
export class DatabaseError extends Error {
	constructor(
		public operation: string,
		public detail?: string
	) {
		super(`Storage ${operation} failed${detail ? `: ${detail}` : ''}`);
		this.name = 'DatabaseError';
	}
}

export function isDatabaseError(e: unknown): e is DatabaseError {
	return e instanceof DatabaseError;
}

/**
 * Postgres' "that row already exists".
 *
 * Not a failure everywhere it appears: the read-state tables advance a mark
 * with a conditional update and fall back to an insert, and a conflict there
 * means another writer got in first with a mark at least as far along — which
 * is the outcome asked for, reached by someone else.
 */
export function isUniqueViolation(cause: { code?: string } | null | undefined): boolean {
	return cause?.code === '23505';
}

export const STORAGE_READ_MESSAGE = 'Your saved history could not be loaded. Please try again.';

export const STORAGE_WRITE_MESSAGE = 'That could not be saved. Please try again.';

/**
 * Raise for a failed supabase call.
 *
 * `operation` names what was being done, for the log; the runner is never
 * shown it, because a Postgres message is not addressed to them and can carry
 * column names and constraint details that are nobody else's business.
 */
export function storageFailed(operation: string, cause?: { message?: string } | null): never {
	throw new DatabaseError(operation, cause?.message);
}

/**
 * Run a storage call, translating its failures into SvelteKit errors.
 *
 * The counterpart of `passthrough` for the app's own database rather than for
 * Trenara, and 503 rather than 502 for the same reason it is a separate
 * function: these are two different servers, and a runner told "Trenara is not
 * answering" when it is the history table that is down has been pointed at the
 * wrong thing entirely. The `storage` flag is what the error page reads to
 * tell them apart.
 */
export async function fromStorage<T>(
	fn: () => Promise<T>,
	message: string = STORAGE_READ_MESSAGE
): Promise<T> {
	try {
		return await fn();
	} catch (e) {
		if (isDatabaseError(e)) {
			console.error(`[storage] ${e.message}`);
			error(503, { message, storage: true });
		}
		throw e;
	}
}
