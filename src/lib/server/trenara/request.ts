import { error } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import type { ZodType } from 'zod';
import {
	HttpError,
	MalformedResponseError,
	NetworkError,
	RateLimitError,
	TimeoutError
} from './client';
import type { RateLimitDiagnostic } from './rate-limit';

/**
 * What the app says when Trenara could not be reached at all.
 *
 * Worth naming rather than paraphrasing at each call site: it is the one
 * failure the runner can do something about — wait, or check their signal —
 * and it must not read like the app broke.
 */
export const UNREACHABLE_MESSAGE = 'Trenara could not be reached. Please try again.';

export const TIMEOUT_MESSAGE = 'Trenara took too long to answer. Please try again.';

/**
 * What the app says when Trenara answered with something it cannot read.
 *
 * Deliberately not "try again": a body that is not the JSON it claimed to be
 * is usually a proxy or a maintenance page standing in for the API, and it
 * will keep saying the same thing for as long as it is there.
 */
export const MALFORMED_MESSAGE = 'Trenara sent a response this app could not read.';

/**
 * What the app says when Trenara refuses for going too fast.
 *
 * Named as a pause rather than a fault, because it is one: nothing is broken,
 * nothing is lost, and waiting genuinely fixes it — which is not true of any
 * other failure this app reports.
 */
export const RATE_LIMITED_MESSAGE = 'Trenara is asking this app to slow down.';

/** How long to wait, in words, when Trenara said how long. */
export function retryAfterText(seconds: number | null): string | null {
	if (seconds === null || seconds <= 0) return null;
	if (seconds < 60) return `about ${seconds} second${seconds === 1 ? '' : 's'}`;

	const minutes = Math.ceil(seconds / 60);
	return `about ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/**
 * Whether a failure was the connection rather than the answer.
 *
 * These two are the reason this exists at all: neither carries an HTTP status,
 * so left alone they fall out of a load function as an unhandled exception and
 * the runner is told "Internal Error" for what is usually a train tunnel.
 */
export function isUnreachable(e: unknown): boolean {
	return e instanceof NetworkError || e instanceof TimeoutError;
}

/**
 * Whether the failure was upstream's rather than this app's.
 *
 * The set `handleError` treats as "not our bug" — the connection, and a body
 * that could not be read as what it claimed to be.
 */
export function isUpstreamFailure(e: unknown): boolean {
	return isUnreachable(e) || e instanceof MalformedResponseError;
}

/**
 * Who, if anyone, is shown the rate-limit snapshot on the error page.
 *
 * The snapshot names upstream endpoints, their counts and the serverless
 * instance — a maintenance tool, put on the page because the maintainer reads
 * preview deployments rather than server logs. That is the right call for the
 * person who owns the app and the wrong one for everybody else, and until now
 * there was no way to tell them apart.
 *
 * Unset, nobody gets it on screen. It is still logged in full by the transport
 * on every 429, which is where a diagnostic normally lives; setting this to a
 * Trenara user id puts it back on the page for that one reader.
 */
function isDiagnosticViewer(viewerId: number | undefined): boolean {
	const admin = Number(env.ADMIN_USER_ID);
	return Number.isInteger(admin) && admin > 0 && viewerId === admin;
}

/**
 * The runner this request belongs to, if it belongs to one.
 *
 * `passthrough` is called from load functions and endpoints that have the
 * event but do not pass it down, so it is read from async context rather than
 * threaded through every call site. Absent outside a request — in a unit test,
 * say — which reads as "not the maintainer", the safe answer.
 */
function currentViewerId(): number | undefined {
	try {
		return getRequestEvent().locals.user?.id;
	} catch {
		return undefined;
	}
}

/**
 * The status and message to answer a failed upstream call with.
 *
 * Transport failures become 502/504 — the gateway statuses, which is exactly
 * what this app is in front of Trenara — so that everything downstream, the
 * error page included, can tell "Trenara is down" from "we have a bug".
 *
 * `viewerId` decides whether the 429 snapshot rides along; see
 * {@link isDiagnosticViewer}.
 */
export function describeFailure(
	e: unknown,
	viewerId?: number
): {
	status: number;
	message: string;
	rateLimit?: RateLimitDiagnostic;
} {
	// Before the HttpError branch below, which would otherwise relay Trenara's
	// own wording and lose the snapshot that makes a 429 actionable.
	if (e instanceof RateLimitError) {
		const wait = retryAfterText(e.diagnostic.retryAfterSeconds);
		return {
			status: 429,
			message: wait ? `${RATE_LIMITED_MESSAGE} Try again in ${wait}.` : RATE_LIMITED_MESSAGE,
			...(isDiagnosticViewer(viewerId) ? { rateLimit: e.diagnostic } : {})
		};
	}

	if (e instanceof TimeoutError) return { status: 504, message: TIMEOUT_MESSAGE };
	if (e instanceof NetworkError) return { status: 502, message: UNREACHABLE_MESSAGE };
	if (e instanceof MalformedResponseError) return { status: 502, message: MALFORMED_MESSAGE };
	if (e instanceof HttpError) {
		return { status: toErrorStatus(e.status), message: describeUpstreamError(e) };
	}
	return { status: 500, message: 'Something went wrong.' };
}

/**
 * Fold an upstream status into the range SvelteKit's `error` accepts.
 *
 * It throws on anything outside 400–599, so relaying a status verbatim makes
 * an unusual upstream answer — a 3xx that survived redirect following, or a 0
 * from a proxy — crash inside the error path instead of being reported by it.
 */
function toErrorStatus(status: number): number {
	if (!Number.isInteger(status) || status < 400 || status > 599) return 502;
	return status;
}

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
 * Run an upstream call, translating its failures into SvelteKit errors.
 *
 * The `can_*` flags on a training say what Trenara will accept, but they are a
 * snapshot: the coach can change the plan between the read and the write. So a
 * refusal is a normal outcome here and is passed through with its own status
 * and message rather than collapsed into a 500.
 *
 * A connection that never got an answer is passed through in the same spirit:
 * as a 502 or 504 saying which of the two servers is not answering, rather
 * than as the unhandled exception it used to be.
 */
export async function passthrough<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof HttpError || isUpstreamFailure(e)) {
			const { status, message, rateLimit } = describeFailure(e, currentViewerId());
			// The snapshot rides along on the error body so the page can show it:
			// the maintainer reads a preview deployment, not a server log.
			error(status, rateLimit ? { message, rateLimit } : message);
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

/**
 * Whether a refusal means "there is nothing there" rather than "this failed".
 *
 * Trenara answers a read for a record the account does not have with a 404 and
 * a body of `{"message":"No result found"}`, which `passthrough` relays
 * faithfully — correct for a write that was refused, and wrong for a read
 * whose empty answer is a normal state of the account. A runner who has just
 * deleted their goal has not hit an error; there is simply no goal.
 */
export function isMissingUpstream(e: unknown): boolean {
	return e instanceof HttpError && e.status === 404;
}

/**
 * `passthrough` for a read that is allowed to find nothing.
 *
 * A 404 becomes `null` for the page to render an empty state from; everything
 * else keeps the status and message `passthrough` composes, so an outage, a
 * rate limit and an expired session are still told apart.
 */
export async function passthroughOptional<T>(fn: () => Promise<T>): Promise<T | null> {
	return passthrough(async () => {
		try {
			return await fn();
		} catch (e) {
			if (isMissingUpstream(e)) return null;
			throw e;
		}
	});
}
