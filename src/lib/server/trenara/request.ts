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

/** The validation envelope a rejected write comes back in. */
interface ValidationBody {
	message?: string;
	/** Field name to the messages that failed for it. */
	errors?: Record<string, string[]>;
}

/**
 * Describe an upstream failure using every field it named.
 *
 * A rejected write summarises itself as "The height field must be a string.
 * (and 1 more error)" and puts the rest in an `errors` map. Against a
 * documented API the summary would be enough; against this one the hidden half
 * is the useful half — it is how a wrong field name or a wrong type gets
 * identified at all — so the map is flattened into the message rather than
 * dropped with the response body.
 */
export function describeUpstreamError(e: HttpError): string {
	const fields = (e.data as ValidationBody | null | undefined)?.errors;
	if (!fields) return e.message;

	const detail = Object.entries(fields)
		.map(([field, messages]) => `${field}: ${messages.join(' ')}`)
		.join(' · ');

	return detail || e.message;
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
			error(e.status, describeUpstreamError(e));
		}
		throw e;
	}
}
