import { error } from '@sveltejs/kit';
import type { ZodType } from 'zod';
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

/** The value at a zod issue's path, for saying what actually arrived. */
function valueAt(raw: unknown, path: PropertyKey[]): unknown {
	let at = raw;
	for (const key of path) {
		if (at === null || typeof at !== 'object') return undefined;
		at = (at as Record<PropertyKey, unknown>)[key];
	}
	return at;
}

/** One-line rendering of a rejected value: `"athletics_track"`, `-1`, `an array`. */
function describeValue(value: unknown): string {
	if (value === undefined) return 'nothing';
	if (value === null || typeof value === 'boolean' || typeof value === 'number') {
		return String(value);
	}
	if (typeof value === 'string') {
		return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value);
	}
	if (Array.isArray(value)) return 'an array';
	return typeof value === 'object' ? 'an object' : `a ${typeof value}`;
}

/**
 * Parse a request body, naming what failed rather than that something did.
 *
 * A rejected body used to answer "Invalid request body", which tells the caller
 * nothing it can act on: a client running an older bundle than the server — an
 * enum value renamed since that bundle shipped, say — reads exactly like a bug
 * in the endpoint. Naming the field, what arrived and what was wanted is the
 * same reasoning `describeUpstreamError` applies to Trenara's own rejections.
 *
 * The value goes into the message because these bodies carry enum values, ids
 * and flags the app itself composes, and nothing private. A value that is not a
 * primitive is described by its type instead of being serialised into the
 * message.
 */
export function parseBody<T>(schema: ZodType<T>, raw: unknown): T {
	const parsed = schema.safeParse(raw);
	if (parsed.success) return parsed.data;

	const detail = parsed.error.issues
		.map((issue) => {
			const field = issue.path.join('.') || 'body';
			return `${field}: ${issue.message}, got ${describeValue(valueAt(raw, issue.path))}`;
		})
		.join(' · ');

	error(400, detail || 'Invalid request body');
}
