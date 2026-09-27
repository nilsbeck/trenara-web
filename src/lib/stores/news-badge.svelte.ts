import { formatUnread, type UnreadSummary } from '$lib/utils/news-unread';

/**
 * How long a badge on screen is trusted before the navbar asks again — the
 * server's own cache of it, since asking sooner would be answered from there.
 */
export const NEWS_BADGE_MAX_AGE_MS = 10 * 60 * 1000;

/** An answer from `/api/v1/news/badge`, and the load it was asked on top of. */
interface Fetched {
	basis: UnreadSummary | null;
	summary: UnreadSummary;
}

/**
 * The unread-news dot on the menu button.
 *
 * Seeded by the layout load, which is the only thing that used to set it —
 * and the layout load runs on a full page load and nowhere else. Not on a
 * client-side navigation, not when a PWA comes back from the background. On
 * a desktop, where tabs are opened and reloaded, that was enough. On a phone
 * the app is opened from the home screen, often onto a cold instance whose
 * load gave up on the badge after a fifth of a second, and then used for days
 * without a reload: the dot was never drawn there at all.
 *
 * So this asks for the badge itself — when the load had none, and when the
 * one on screen has aged past the server's cache.
 *
 * An answer is tied to the load it was asked on top of. When the load runs
 * again — the news page marks the feed read and invalidates it — the new
 * load's value wins, and an answer that was in flight before it is dropped
 * rather than seated over it: it would put back a dot the reader has just
 * cleared.
 */
export class NewsBadgeStore {
	#load: () => UnreadSummary | null;
	#fetch: typeof fetch;
	#now: () => number;

	/** Raw: `basis` is compared by reference, and a proxy is not the original. */
	#fetched = $state.raw<Fetched | null>(null);

	/** When the badge was last asked for, by the load or by `refresh`. */
	#checkedAt: number;

	constructor(
		load: () => UnreadSummary | null,
		{ fetch: fetcher = fetch, now = Date.now }: { fetch?: typeof fetch; now?: () => number } = {}
	) {
		this.#load = load;
		this.#fetch = fetcher;
		this.#now = now;
		this.#checkedAt = now();
	}

	summary = $derived.by(() => {
		const basis = this.#load();
		const fetched = this.#fetched;
		return fetched && fetched.basis === basis ? fetched.summary : basis;
	});

	/** `3`, `10+`, or empty when there is no dot to draw. */
	label = $derived(this.summary ? formatUnread(this.summary) : '');

	/**
	 * The load could not say — it timed out or failed. Not the same as nothing
	 * unread, which the load reports as a count of zero.
	 */
	get unknown(): boolean {
		return this.#load() === null;
	}

	get checkedAt(): number {
		return this.#checkedAt;
	}

	/**
	 * Ask the server again. Fails quietly: the dot is advisory, and a failed
	 * ask leaves whatever was on screen where it was.
	 */
	async refresh(): Promise<void> {
		const basis = this.#load();
		this.#checkedAt = this.#now();

		try {
			const res = await this.#fetch('/api/v1/news/badge');
			if (!res.ok) return;
			const { badge } = (await res.json()) as { badge: UnreadSummary | null };
			// Unknowable to the server too: keep what is on screen rather than
			// clearing a dot nobody has read.
			if (!badge) return;
			this.#fetched = { basis, summary: badge };
		} catch {
			// Offline, or a response that was not JSON — the next check asks again.
		}
	}
}
