import type {
	ExchangeCandidate,
	ScheduledTrainingDetail,
	Shoe,
	TrainingHeightDifference,
	TrainingSurface
} from '$lib/server/trenara/types';
import { activityLabel, type SettingKey } from '$lib/utils/session-setup';
import { describeError, describeResponse, isAbort } from '$lib/utils/network';
import { appConfig } from './app-config.svelte';

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
	/**
	 * Told about every training the server hands back after a change, so the
	 * week the calendar is holding can be kept in step. Without it the detail
	 * card is right and everything around it is a version behind.
	 */
	#onChange?: (training: ScheduledTrainingDetail) => void;

	constructor(onChange?: (training: ScheduledTrainingDetail) => void) {
		this.#onChange = onChange;
	}

	detail = $state<ScheduledTrainingDetail | null>(null);
	shoes = $state<Shoe[] | null>(null);
	candidates = $state<ExchangeCandidate[] | null>(null);

	/** Which setting is mid-flight, so its own control can show it. */
	pending = $state<SettingKey | null>(null);
	error = $state<string | null>(null);

	/**
	 * The last session swap, and how to put it back.
	 *
	 * Replacing a session rewrites every block, which is a lot to do on one tap
	 * — but it is reversible, so an undo is a better answer than a confirm
	 * dialog standing between the runner and every swap they meant.
	 */
	undoable = $state<{ message: string; apply: () => Promise<boolean> } | null>(null);

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
		this.undoable = null;

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
			if (isAbort(e)) return;
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
			if (!res.ok) throw new Error(await describeResponse(res, 'Could not load your shoes.'));
			this.shoes = await res.json();
		} catch (e) {
			this.shoes = [];
			this.error = describeError(e, 'Could not load your shoes.');
		}
	}

	/** Alternatives for this session, fetched when the workout picker opens. */
	async loadCandidates(): Promise<void> {
		if (this.candidates || this.#trainingId == null) return;
		try {
			const res = await fetch(`/api/v1/training/${this.#trainingId}/exchange`);
			if (!res.ok) throw new Error(await describeResponse(res, 'Could not load the alternatives.'));
			this.candidates = await res.json();
		} catch (e) {
			this.candidates = [];
			this.error = describeError(e, 'Could not load the alternatives.');
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

	/** Choose a pacing strategy for the goal race. `null` is "no pacing plan". */
	setPacingPlan(pacingPlan: string | null) {
		return this.#mutate('pacing', 'pacing-plan', 'PUT', { pacingPlan });
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

	/** Swap the activity. `null` turns the session back into a run. */
	async crossTrain(crossType: string | null): Promise<boolean> {
		const previous = this.detail?.cross_type ?? null;
		if (!(await this.#mutate('session', 'cross-train', 'PUT', { crossType }))) return false;

		// The inverse of a cross-train is exactly a cross-train, so this undo is
		// precise rather than a best effort.
		this.undoable = {
			message: `Swapped to ${activityLabel(crossType, appConfig.current)}.`,
			apply: () => this.crossTrain(previous)
		};
		return true;
	}

	async exchange(candidateId: number): Promise<boolean> {
		const previousTitle = this.detail?.title;
		if (!(await this.#mutate('session', 'exchange', 'PUT', { candidateId }))) return false;

		// Undoing an exchange means exchanging back, and that needs the old session
		// to still be on offer — which is not guaranteed. So the offer is made
		// only once the candidate is actually in hand, and stays unmade rather
		// than promising something that would fail on the tap.
		await this.loadCandidates();
		const back = previousTitle
			? this.candidates?.find((candidate) => candidate.title === previousTitle)
			: undefined;

		if (back) {
			this.undoable = {
				message: `Swapped to ${this.detail?.title ?? 'another session'}.`,
				apply: () => this.exchange(back.id)
			};
		}

		return true;
	}

	/** Put the last swap back, if it is still possible. */
	async undo(): Promise<boolean> {
		const pending = this.undoable;
		if (!pending) return false;
		this.undoable = null;
		return pending.apply();
	}

	dismissUndo(): void {
		this.undoable = null;
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
		this.undoable = null;
		const trainingId = this.#trainingId;

		try {
			const res = await fetch(`/api/v1/training/${trainingId}/${path}`, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!res.ok) {
				throw new Error(await describeResponse(res, 'Could not save the change.'));
			}

			const detail: ScheduledTrainingDetail = await res.json();

			// The runner moved to another day while this was in flight.
			if (this.#trainingId !== trainingId) return false;

			this.detail = detail;
			this.#onChange?.(detail);
			// Replacing the session — by either route — leaves the cached
			// alternatives describing a training that is no longer there.
			if (key === 'session') this.candidates = null;
			return true;
		} catch (e) {
			if (this.#trainingId === trainingId) {
				this.error = describeError(e, 'Could not save the change.');
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
