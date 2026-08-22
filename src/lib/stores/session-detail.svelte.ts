import type {
	ExchangeCandidate,
	ScheduledTraining,
	ScheduledTrainingDetail,
	Shoe,
	TrainingHeightDifference,
	TrainingSurface
} from '$lib/server/trenara/types';
import type { SettingKey } from '$lib/utils/session-setup';

/**
 * The detail and mutations for one selected training.
 *
 * Two things shape this store:
 *
 * 1. The week response carries none of the capability flags or change
 *    packages, so the detail has to be fetched separately when a day is
 *    selected. Until it lands the card renders from the week data and the
 *    setup rail simply is not there yet.
 *
 * 2. Every mutation returns the complete training, so a commit *replaces* the
 *    detail rather than patching a field. That matters: changing intensity
 *    rewrites every block's pace and colour, changing the workout rewrites the
 *    blocks entirely, and either can flip other capability flags. Merging by
 *    hand would leave the UI describing a training that no longer exists.
 */
export class SessionDetailStore {
	detail = $state<ScheduledTrainingDetail | null>(null);
	shoes = $state<Shoe[] | null>(null);
	candidates = $state<ExchangeCandidate[] | null>(null);

	/** Which setting is mid-flight, so its own control can show it. */
	pending = $state<SettingKey | null>(null);
	error = $state<string | null>(null);

	loading = $state(false);

	#trainingId: number | null = null;
	#detailRequest: AbortController | null = null;

	/**
	 * Point the store at a training. Safe to call on every render: it only
	 * refetches when the id actually changes.
	 */
	load(trainingId: number | null): void {
		if (trainingId === this.#trainingId) return;

		this.#trainingId = trainingId;
		this.#detailRequest?.abort();
		this.detail = null;
		this.candidates = null;
		this.pending = null;
		this.error = null;

		if (trainingId == null) {
			this.loading = false;
			return;
		}

		void this.#fetchDetail(trainingId);
	}

	async #fetchDetail(trainingId: number): Promise<void> {
		const controller = new AbortController();
		this.#detailRequest = controller;
		this.loading = true;

		try {
			const res = await fetch(`/api/v1/training/${trainingId}`, { signal: controller.signal });
			if (!res.ok) throw new Error(`Failed to load training (${res.status})`);
			const detail: ScheduledTrainingDetail = await res.json();

			// A newer selection won on the way back — drop this one.
			if (this.#detailRequest !== controller) return;
			this.detail = detail;
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') return;
			if (this.#detailRequest !== controller) return;
			// The card still shows the week's copy of the training, so this
			// failure costs the setup controls and nothing else.
			this.detail = null;
		} finally {
			if (this.#detailRequest === controller) this.loading = false;
		}
	}

	/** The user's shoes, fetched once, the first time the picker opens. */
	async loadShoes(): Promise<void> {
		if (this.shoes) return;
		try {
			const res = await fetch('/api/v1/shoes');
			if (!res.ok) throw new Error(`Failed to load shoes (${res.status})`);
			this.shoes = await res.json();
		} catch {
			this.shoes = [];
			this.error = 'Could not load your shoes.';
		}
	}

	/** Alternatives for this session, fetched when the workout picker opens. */
	async loadCandidates(): Promise<void> {
		if (this.candidates || this.#trainingId == null) return;
		try {
			const res = await fetch(`/api/v1/training/${this.#trainingId}/exchange`);
			if (!res.ok) throw new Error(`Failed to load alternatives (${res.status})`);
			this.candidates = await res.json();
		} catch {
			this.candidates = [];
			this.error = 'Could not load the alternatives.';
		}
	}

	/**
	 * Set the terrain.
	 *
	 * All three go up together: the endpoint rejects a partial condition rather
	 * than merging one, so the climb travels even when the runner only touched
	 * the surface.
	 */
	setTerrain(
		surface: TrainingSurface,
		heightDifference: TrainingHeightDifference,
		heightValue = 0
	) {
		return this.#mutate('terrain', 'condition', 'POST', {
			surface,
			heightDifference,
			heightValue
		});
	}

	setEffort(intensityValue: number) {
		return this.#mutate('effort', 'intensity', 'PUT', { intensityValue });
	}

	setVolume(distanceValue: number) {
		return this.#mutate('volume', 'distance', 'PUT', { distanceValue });
	}

	setShoe(shoeId: number) {
		return this.#mutate('shoe', 'shoe', 'PUT', { shoeId });
	}

	/**
	 * Add or drop the cool-down.
	 *
	 * Takes the target state rather than flipping the current one, so a double
	 * tap cannot land on whichever order the server happened to process.
	 *
	 * This is the one endpoint whose shape was inferred rather than observed
	 * (see `trainingApi.setCooldown`), so "answered 200 and changed nothing" is
	 * a real possibility here in a way it is not for its siblings. Left alone
	 * that reads as a button doing nothing, so it is checked and reported.
	 */
	async setCooldown(hasCooldown: boolean): Promise<boolean> {
		if (!(await this.#mutate('cooldown', 'cooldown', 'PUT', { hasCooldown }))) return false;

		if (this.detail && this.detail.has_cooldown !== hasCooldown) {
			this.error = hasCooldown
				? 'Trenara did not add the cool-down back — the session is unchanged.'
				: 'Trenara did not remove the cool-down — the session is unchanged.';
			return false;
		}

		return true;
	}

	crossTrain(crossType: string) {
		return this.#mutate('activity', 'cross-train', 'PUT', { crossType });
	}

	exchange(candidateId: number) {
		return this.#mutate('workout', 'exchange', 'PUT', { candidateId });
	}

	/**
	 * Send one change and adopt whatever comes back.
	 *
	 * Nothing is applied optimistically, so a failure needs no rollback: the
	 * controls keep showing the last state the server confirmed. Overlapping
	 * calls are refused rather than queued — they all rewrite the same object,
	 * so racing them would leave the last response to win arbitrarily.
	 */
	async #mutate(
		key: SettingKey,
		path: string,
		method: 'POST' | 'PUT',
		body: Record<string, unknown>
	): Promise<boolean> {
		if (this.#trainingId == null) return false;
		if (this.pending) {
			this.error = 'Still saving the last change. Give it a second and try again.';
			return false;
		}

		this.pending = key;
		this.error = null;
		const trainingId = this.#trainingId;

		try {
			const res = await fetch(`/api/v1/training/${trainingId}/${path}`, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.message ?? `Could not save the change (${res.status})`);
			}

			const detail: ScheduledTrainingDetail = await res.json();

			// The runner moved to another day while this was in flight.
			if (this.#trainingId !== trainingId) return false;

			this.detail = detail;
			// Exchanging or cross-training replaces the session, so the old
			// alternatives no longer describe it.
			if (key === 'workout' || key === 'activity') this.candidates = null;
			return true;
		} catch (e) {
			if (this.#trainingId === trainingId) {
				this.error = e instanceof Error ? e.message : 'Could not save the change.';
			}
			return false;
		} finally {
			if (this.#trainingId === trainingId) this.pending = null;
		}
	}

	dismissError(): void {
		this.error = null;
	}
}

/**
 * The training the setup UI should describe: the detail once it has arrived,
 * the week's copy until then.
 */
export function effectiveTraining(
	store: SessionDetailStore,
	fallback: ScheduledTraining | null
): ScheduledTraining | null {
	return store.detail ?? fallback;
}
