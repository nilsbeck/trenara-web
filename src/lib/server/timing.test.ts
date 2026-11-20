import { describe, it, expect } from 'vitest';
import { createTiming, timed, serverTiming } from './timing';
import type { RequestEvent } from '@sveltejs/kit';

/** A clock the test moves by hand. */
function clock() {
	let t = 1000;
	return { now: () => t, advance: (ms: number) => (t += ms) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createTiming', () => {
	it('records each piece of work with its duration and when it started', async () => {
		const c = clock();
		const timing = createTiming(c.now);

		c.advance(250);
		let finish!: (value: string) => void;
		const work = timing.measure('schedule', new Promise<string>((r) => (finish = r)));
		c.advance(310);
		finish('done');

		await expect(work).resolves.toBe('done');
		await settle();
		expect(timing.header()).toBe('schedule;dur=310.0;desc="schedule from +250ms", total;dur=560.0');
	});

	/**
	 * Chrome's Timing panel shows an entry's description in place of its name
	 * whenever there is one, so a description that was only the start time
	 * left every row reading "+7ms" and nothing to say which was which.
	 */
	it('names each entry in its description, which is what the browser shows', async () => {
		const timing = createTiming(clock().now);

		await timing.measure('account', Promise.resolve());
		await settle();

		expect(timing.header()).toMatch(/^account;dur=[\d.]+;desc="account from \+0ms"/);
	});

	it('records a failure too, and leaves the rejection with the caller', async () => {
		const c = clock();
		const timing = createTiming(c.now);

		const work = timing.measure('account', Promise.reject(new Error('down')));

		await expect(work).rejects.toThrow('down');
		await settle();
		expect(timing.header()).toContain('account;dur=0.0;desc="account from +0ms"');
	});

	/**
	 * The dashboard's reads had all settled by +377ms on a preview and the
	 * response was ready at +576ms, with nothing to say what the difference was.
	 */
	it('records the render from the last read settling to the HTML being ready', async () => {
		const c = clock();
		const timing = createTiming(c.now);

		let finishGoal!: () => void;
		let finishShare!: () => void;
		timing.measure('goal', new Promise<void>((r) => (finishGoal = r)));
		c.advance(220);
		finishGoal();
		await settle();
		timing.measure('share', new Promise<void>((r) => (finishShare = r)));
		c.advance(140);
		finishShare();
		await settle();
		c.advance(200);
		timing.rendered();

		expect(timing.header()).toContain('render;dur=200.0;desc="render from +360ms"');
	});

	it('counts the whole request as the render when nothing was read', () => {
		const c = clock();
		const timing = createTiming(c.now);

		c.advance(12);
		timing.rendered();

		expect(timing.header()).toBe('render;dur=12.0;desc="render from +0ms", total;dur=12.0');
	});

	it('leaves out what has not settled by the time the header is written', () => {
		const timing = createTiming(clock().now);

		timing.measure('slow', new Promise(() => {}));

		expect(timing.header()).toBe('total;dur=0.0');
	});
});

describe('timed', () => {
	it('hands the work back untouched when the request is not being timed', async () => {
		const work = Promise.resolve(7);

		expect(timed({ user: null }, 'goal', work)).toBe(work);
	});
});

describe('serverTiming', () => {
	it('writes the header onto the response', async () => {
		const event = { locals: { user: null } } as unknown as RequestEvent;

		const response = await serverTiming({
			event,
			resolve: async (e) => {
				await timed(e.locals, 'account', Promise.resolve('runner'));
				return new Response('page');
			}
		});

		expect(response.headers.get('server-timing')).toMatch(
			/^account;dur=[\d.]+;desc="account from \+\d+ms", total;dur=[\d.]+$/
		);
	});

	it('times the render once, on the first chunk of HTML, and leaves the HTML alone', async () => {
		const event = { locals: { user: null } } as unknown as RequestEvent;
		const chunks: string[] = [];

		const response = await serverTiming({
			event,
			resolve: async (e, options) => {
				await timed(e.locals, 'account', Promise.resolve('runner'));
				// A page that streams: the shell first, a streamed promise after.
				chunks.push((await options?.transformPageChunk?.({ html: '<main>', done: false })) ?? '');
				chunks.push((await options?.transformPageChunk?.({ html: '</main>', done: true })) ?? '');
				return new Response(chunks.join(''));
			}
		});

		expect(chunks).toEqual(['<main>', '</main>']);
		const header = response.headers.get('server-timing') ?? '';
		expect(header.match(/render;/g)).toHaveLength(1);
		expect(header).toMatch(
			/^account;dur=[\d.]+;desc="[^"]+", render;dur=[\d.]+;desc="render from \+\d+ms", total/
		);
	});

	it('still answers when the response will not take another header', async () => {
		const event = { locals: { user: null } } as unknown as RequestEvent;
		const frozen = Response.redirect('https://trainara.test/login', 302);

		const response = await serverTiming({ event, resolve: async () => frozen });

		expect(response.status).toBe(302);
	});
});
