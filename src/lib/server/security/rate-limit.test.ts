import { describe, it, expect } from 'vitest';
import { RateLimiter } from './rate-limit';

describe('RateLimiter', () => {
	it('allows up to the limit and refuses the one after', () => {
		const limiter = new RateLimiter({ limit: 3, windowMs: 1000 });

		expect(limiter.check('a', 0).allowed).toBe(true);
		expect(limiter.check('a', 100).allowed).toBe(true);
		expect(limiter.check('a', 200).allowed).toBe(true);
		expect(limiter.check('a', 300).allowed).toBe(false);
	});

	it('counts each key separately', () => {
		const limiter = new RateLimiter({ limit: 1, windowMs: 1000 });

		expect(limiter.check('a', 0).allowed).toBe(true);
		expect(limiter.check('b', 0).allowed).toBe(true);
		expect(limiter.check('a', 0).allowed).toBe(false);
	});

	it('starts a fresh window once the old one has passed', () => {
		const limiter = new RateLimiter({ limit: 1, windowMs: 1000 });

		expect(limiter.check('a', 0).allowed).toBe(true);
		expect(limiter.check('a', 999).allowed).toBe(false);
		expect(limiter.check('a', 1000).allowed).toBe(true);
	});

	it('says how long is left, in whole seconds and never zero', () => {
		const limiter = new RateLimiter({ limit: 1, windowMs: 60_000 });

		limiter.check('a', 0);
		expect(limiter.check('a', 0).retryAfterSeconds).toBe(60);
		expect(limiter.check('a', 59_500).retryAfterSeconds).toBe(1);
	});

	// A refused attempt still counts, so hammering the endpoint cannot outrun
	// the window by arriving faster than it ticks.
	it('counts refused attempts too', () => {
		const limiter = new RateLimiter({ limit: 1, windowMs: 1000 });

		limiter.check('a', 0);
		limiter.check('a', 100);
		limiter.check('a', 200);

		// Still inside the first window, still refused — the window did not move.
		expect(limiter.check('a', 999).allowed).toBe(false);
		expect(limiter.check('a', 1000).allowed).toBe(true);
	});

	// A password that worked is not an attack: two typos then a success must
	// leave the runner with a clean slate.
	it('forgets a key on demand', () => {
		const limiter = new RateLimiter({ limit: 2, windowMs: 1000 });

		limiter.check('a', 0);
		limiter.check('a', 1);
		expect(limiter.check('a', 2).allowed).toBe(false);

		limiter.clear('a');

		expect(limiter.check('a', 3).allowed).toBe(true);
	});

	// The keys are attacker-supplied, so an unbounded map would make the
	// limiter the exhaustion vector it exists to prevent.
	it('does not grow without bound', () => {
		const limiter = new RateLimiter({ limit: 1, windowMs: 60_000 });

		for (let i = 0; i < 6000; i++) limiter.check(`key-${i}`, i);

		// The oldest keys were dropped, so an early one is treated as new again
		// rather than being remembered forever.
		expect(limiter.check('key-0', 6000).allowed).toBe(true);
	});
});
