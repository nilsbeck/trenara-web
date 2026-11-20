import type { Handle } from '@sveltejs/kit/hooks';

/**
 * Where a request's time goes on the server, sent back as `Server-Timing`.
 *
 * The browser shows it in the developer tools — Network, the request, Timing —
 * which is the one place the maintainer can read it, since branches are tried
 * as Vercel previews rather than on a machine with a terminal (agents.md §6).
 * It exists to answer questions like "how much of a dashboard load is the
 * identity check, and how much is the plan?" with a number rather than a guess.
 *
 * Each entry has its duration and, in its description, its name and when it
 * started relative to the request: `schedule;dur=310;desc="schedule from
 * +250ms"` is a schedule read that began 250ms in — after something else had
 * finished — and took 310ms. The name is repeated in the description because
 * Chrome's Timing panel shows the description in place of the name whenever
 * there is one: with only the start time there, every row read "+7ms" and
 * nothing said which was which.
 * Overlap and waiting are read off those two figures; `render` is the page
 * being built once its data is in (see `serverTiming` below); `total` is the
 * server's whole share of the wait, up to the moment the response was handed
 * back.
 *
 * Timings only: no names of runners, no tokens, nothing a request carried.
 * Same-origin, too — without `Timing-Allow-Origin` no other site's script can
 * read it.
 */
export interface Timing {
	/** Time `work` from now until it settles, under `name`, and hand it back untouched. */
	measure<T>(name: string, work: Promise<T>): Promise<T>;
	/**
	 * The page's HTML is ready: record `render`, from the moment the last timed
	 * read settled until now.
	 */
	rendered(): void;
	/** The `Server-Timing` value: every entry that has settled, and the total so far. */
	header(): string;
}

interface Entry {
	name: string;
	start: number;
	duration: number;
}

export function createTiming(now: () => number = () => performance.now()): Timing {
	const origin = now();
	const entries: Entry[] = [];

	return {
		measure(name, work) {
			const start = now() - origin;
			const done = () => {
				entries.push({ name, start, duration: now() - origin - start });
			};
			// A handler of its own on both outcomes: a rejection is still the
			// caller's to deal with, and recording it must not swallow it or
			// leave it unhandled.
			work.then(done, done);
			return work;
		},

		rendered() {
			const at = now() - origin;
			const dataReady = entries.reduce(
				(latest, { start, duration }) => Math.max(latest, start + duration),
				0
			);
			entries.push({ name: 'render', start: dataReady, duration: at - dataReady });
		},

		header() {
			const parts = entries.map(
				({ name, start, duration }) =>
					`${name};dur=${duration.toFixed(1)};desc="${name} from +${Math.round(start)}ms"`
			);
			parts.push(`total;dur=${(now() - origin).toFixed(1)}`);
			return parts.join(', ');
		}
	};
}

/**
 * `work`, timed under `name` when the request is being timed, and untouched
 * when it is not — a load called from a test has no timing in its locals.
 */
export function timed<T>(locals: App.Locals, name: string, work: Promise<T>): Promise<T> {
	return locals.timing ? locals.timing.measure(name, work) : work;
}

/**
 * Times the request and writes the header on the way out.
 *
 * Placed second in the hook sequence, inside `securityHeaders` and around
 * everything else, so the identity check and the guard's refusals are timed
 * along with the route. A response whose headers cannot be changed goes out
 * without the header rather than failing: this is a diagnostic, and a
 * diagnostic must never be the thing that breaks a page.
 *
 * `render` is the one entry no read reports. The first measurements of the
 * dashboard on a preview had every read settled by +377ms and the response
 * ready at +576ms, and nothing in the header said where the two hundred
 * milliseconds between went. SvelteKit hands `transformPageChunk` the page's
 * HTML as soon as it is rendered — the first call, on a page that streams, is
 * everything that does not wait on a streamed promise — so that call marks the
 * end of the render, and the last timed read settling marks its start: the
 * loads' data merged, written into the page, and the components rendered.
 * Anything a load awaits without timing it lands in `render` too, so it is an
 * upper bound on rendering rather than an exact figure — which is a reason to
 * time a new read on the page, not to trust this less.
 */
export const serverTiming: Handle = async ({ event, resolve }) => {
	const timing = createTiming();
	event.locals.timing = timing;

	let rendered = false;
	const response = await resolve(event, {
		transformPageChunk: ({ html }) => {
			if (!rendered) {
				rendered = true;
				timing.rendered();
			}
			return html;
		}
	});
	try {
		response.headers.append('server-timing', timing.header());
	} catch {
		// Immutable headers: nothing to add the diagnostic to.
	}
	return response;
};
