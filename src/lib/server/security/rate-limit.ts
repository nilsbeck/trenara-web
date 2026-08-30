/**
 * Limiting what this app itself will accept.
 *
 * Distinct from `$lib/server/trenara/rate-limit`, which records what *Trenara*
 * refuses. This is the other direction: the app had no limit of its own
 * anywhere, which left two things open.
 *
 * The login action relays every attempt straight to Trenara's token endpoint
 * from this app's egress IP, so an unthrottled login form makes Trainara a
 * convenient front end for guessing Trenara passwords — with someone else's
 * infrastructure taking the blame. And the endpoints that write to this app's
 * own database accepted as many rows as anyone cared to send.
 *
 * Two honest limits, the same ones the upstream trail carries:
 *
 * 1. The counters are per instance and in memory. On Vercel several instances
 *    may be serving at once, so an attacker spread across them gets the limit
 *    multiplied by however many are warm. It still turns "unbounded" into "a
 *    small multiple of the limit", which is the difference that matters.
 * 2. A cold start forgets everything. Same consequence, same reasoning.
 *
 * A shared store would fix both and is the right move if this ever needs to
 * hold against someone determined; the structure here is deliberately the
 * shape that swap would take.
 */

interface Bucket {
	/** When the current window began. */
	start: number;
	count: number;
}

export interface LimitConfig {
	/** How many are allowed inside one window. */
	limit: number;
	/** How long the window is. */
	windowMs: number;
}

export interface LimitResult {
	allowed: boolean;
	/** Whole seconds until the window rolls over — for `Retry-After`. */
	retryAfterSeconds: number;
}

/**
 * A ceiling on how many keys one limiter holds.
 *
 * The keys are attacker-supplied (an IP, a submitted username), so without
 * this the limiter is itself the memory-exhaustion vector it exists to stop.
 */
const MAX_KEYS = 5000;

export class RateLimiter {
	#buckets = new Map<string, Bucket>();

	constructor(private readonly config: LimitConfig) {}

	/**
	 * Count one attempt against `key` and say whether it is allowed.
	 *
	 * Fixed windows rather than a sliding log: a sliding window would need a
	 * timestamp per attempt, and the extra precision buys nothing against the
	 * per-instance error bar above.
	 */
	check(key: string, now = Date.now()): LimitResult {
		this.#prune(now);

		const bucket = this.#buckets.get(key);
		if (!bucket || now - bucket.start >= this.config.windowMs) {
			this.#buckets.set(key, { start: now, count: 1 });
			return { allowed: true, retryAfterSeconds: 0 };
		}

		bucket.count += 1;
		if (bucket.count <= this.config.limit) {
			return { allowed: true, retryAfterSeconds: 0 };
		}

		const remaining = this.config.windowMs - (now - bucket.start);
		return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(remaining / 1000)) };
	}

	/** Forget a key — what a successful login does, so one typo costs nothing. */
	clear(key: string): void {
		this.#buckets.delete(key);
	}

	#prune(now: number): void {
		for (const [key, bucket] of this.#buckets) {
			if (now - bucket.start >= this.config.windowMs) this.#buckets.delete(key);
		}

		// Still over after the expired ones have gone: drop oldest first. Only
		// reachable under an attack wide enough to hold thousands of live keys,
		// and dropping the oldest is the least useful thing to forget.
		if (this.#buckets.size > MAX_KEYS) {
			const oldest = [...this.#buckets.entries()].sort((a, b) => a[1].start - b[1].start);
			for (const [key] of oldest.slice(0, this.#buckets.size - MAX_KEYS)) {
				this.#buckets.delete(key);
			}
		}
	}

	/** Testing seam — a limiter is module-scoped and outlives a single case. */
	reset(): void {
		this.#buckets.clear();
	}
}

/**
 * Login attempts, counted two ways.
 *
 * By IP, to bound one source hammering many accounts; and by username, to
 * bound many sources hammering one account — which is what credential stuffing
 * looks like and what an IP limit alone does not see. Both are deliberately
 * loose enough that a runner who has genuinely forgotten their password never
 * meets them.
 */
export const loginByIp = new RateLimiter({ limit: 10, windowMs: 5 * 60 * 1000 });
export const loginByUsername = new RateLimiter({ limit: 5, windowMs: 15 * 60 * 1000 });

/**
 * Every `/api` request, per signed-in runner.
 *
 * A ceiling rather than a throttle: the read cache and the conditional
 * schedule fetch already keep honest use far below it — a busy page load is
 * five or ten calls, and a tab left open costs one a minute. Four a second
 * sustained is well above anything the client does and well below what it
 * takes to make this app a load generator pointed at Trenara.
 */
export const apiRequests = new RateLimiter({ limit: 240, windowMs: 60 * 1000 });

/**
 * Writes to this app's own database, per user.
 *
 * Sized for the honest client: the goal card archives once per page view and
 * the chat bubble marks a thread read as it renders one. Thirty a minute is
 * far above that and far below what it takes to fill a table.
 */
export const storageWrites = new RateLimiter({ limit: 30, windowMs: 60 * 1000 });
