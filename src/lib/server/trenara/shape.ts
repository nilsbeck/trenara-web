import { MalformedResponseError } from './client';

/**
 * Checking that a response is the kind of thing it claims to be — no more.
 *
 * The types in `types.ts` describe what captured traffic has held, not what
 * Trenara promises, and the app reads them as though they were guarantees.
 * Where that goes wrong is not usually a subtly wrong field: it is a response
 * that is not the right *shape* at all — a bare `null`, an error envelope
 * where a list was expected, a maintenance page that happened to parse. Left
 * unchecked those surface as `Cannot read properties of null` somewhere deep
 * in a component, which names neither the endpoint nor the cause.
 *
 * Deliberately not a schema validator. A strict schema over a
 * reverse-engineered API fails on the API's own *additions* — a new field
 * appears upstream and the app stops working, which is a worse failure than
 * the one being prevented. So these check only the handful of things the app
 * would immediately crash on, and pass everything else through untouched.
 *
 * A failure is a {@link MalformedResponseError}, which `describeFailure`
 * already answers with 502 and "Trenara sent a response this app could not
 * read" — the right blame, and a page the runner can retry from.
 */

function describe(value: unknown): string {
	if (value === null) return 'null';
	if (Array.isArray(value)) return 'an array';
	return typeof value;
}

/** A response that has to be a JSON object before anything reads a field off it. */
export function expectObject<T>(value: unknown, endpoint: string): T {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new MalformedResponseError(
			`${endpoint} answered with ${describe(value)}, wanted an object`
		);
	}
	return value as T;
}

/** A response that has to be a JSON array before anything maps or filters it. */
export function expectArray<T>(value: unknown, endpoint: string): T[] {
	if (!Array.isArray(value)) {
		throw new MalformedResponseError(
			`${endpoint} answered with ${describe(value)}, wanted an array`
		);
	}
	return value as T[];
}

/**
 * An object whose named fields are arrays when they are there at all.
 *
 * For the responses the app iterates. A missing collection is fine — every
 * consumer already reads it as `?? []`, and an absent week is a real answer —
 * but a collection that arrived as something other than a list is not
 * something `for…of` survives.
 */
export function expectCollections<T>(value: unknown, endpoint: string, keys: string[]): T {
	const object = expectObject<Record<string, unknown>>(value, endpoint);

	for (const key of keys) {
		const collection = object[key];
		if (collection !== undefined && collection !== null && !Array.isArray(collection)) {
			throw new MalformedResponseError(
				`${endpoint} answered with ${describe(collection)} for ${key}, wanted an array`
			);
		}
	}

	return object as T;
}
