import { error } from '@sveltejs/kit';
import { HttpError } from './client';

/**
 * Parse a training id out of a route param.
 *
 * Trenara's scheduled-training ids are large but still plain integers, so
 * anything non-numeric is a malformed URL rather than a missing training.
 */
export function parseTrainingId(raw: string | undefined): number {
	const id = Number(raw);
	if (!Number.isInteger(id) || id <= 0) {
		error(400, 'Invalid training id');
	}
	return id;
}

/**
 * Run an upstream call, translating its HTTP failures into SvelteKit errors.
 *
 * The `can_*` flags on a training say what Trenara will accept, but they are a
 * snapshot: the coach can change the plan between the read and the write. So a
 * refusal is a normal outcome here and is passed through with its own status
 * and message rather than collapsed into a 500.
 */
export async function passthrough<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof HttpError) {
			error(e.status, e.message);
		}
		throw e;
	}
}
