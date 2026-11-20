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
		expect(timing.header()).toBe('schedule;dur=310.0;desc="+250ms", total;dur=560.0');
	});

	it('records a failure too, and leaves the rejection with the caller', async () => {
		const c = clock();
		const timing = createTiming(c.now);

		const work = timing.measure('account', Promise.reject(new Error('down')));

		await expect(work).rejects.toThrow('down');
		await settle();
		expect(timing.header()).toContain('account;dur=0.0;desc="+0ms"');
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
			/^account;dur=[\d.]+;desc="\+\d+ms", total;dur=[\d.]+$/
		);
	});

	it('still answers when the response will not take another header', async () => {
		const event = { locals: { user: null } } as unknown as RequestEvent;
		const frozen = Response.redirect('https://trainara.test/login', 302);

		const response = await serverTiming({ event, resolve: async () => frozen });

		expect(response.status).toBe(302);
	});
});
