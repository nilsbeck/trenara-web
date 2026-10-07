import type { NewTrainingCandidate, ScheduledTrainingDetail } from '$lib/server/trenara/types';
import type { NewTrainingOptions } from '$lib/utils/schedule';
import { describeError, describeResponse, isAbort } from '$lib/utils/network';

/**
 * Where the add-a-training picker stands.
 *
 * `full` and `empty` are kept apart on purpose: "this week will take nothing
 * more" and "Trenara had nothing to offer for this day" ask different things of
 * the runner, and one blank list would say neither.
 */
export type AddTrainingPhase = 'closed' | 'loading' | 'ready' | 'full' | 'empty' | 'failed';

/**
 * Adding a session to an empty day: list what Trenara offers for it, then add
 * one.
 *
 * One store per day — the component that owns it is re-created when the
 * selected day changes, so nothing here has to notice a new date arriving.
 *
 * Adding does not seat the answer in the calendar. Trenara can rework the rest
 * of the week around a new session, and the training it hands back dates
 * itself by a UTC instant that names the day before (see `ScheduledTraining`),
 * so `onAdded` is where the owner refreshes the plan instead.
 */
export class AddTrainingStore {
	phase = $state<AddTrainingPhase>('closed');
	candidates = $state<NewTrainingCandidate[]>([]);
	/** Why the list could not be loaded. */
	error = $state<string | null>(null);
	/** The candidate being added, so its own row can say so. */
	adding = $state<number | null>(null);
	/** Why the last add was refused; the list stays up so another can be tried. */
	addError = $state<string | null>(null);

	#date: string;
	#onAdded: (training: ScheduledTrainingDetail) => void | Promise<unknown>;
	#request: AbortController | null = null;

	constructor(
		date: string,
		onAdded: (training: ScheduledTrainingDetail) => void | Promise<unknown>
	) {
		this.#date = date;
		this.#onAdded = onAdded;
	}

	/** Open the picker and ask what could go on this day. */
	async open(): Promise<void> {
		this.#request?.abort();
		const controller = new AbortController();
		this.#request = controller;

		this.phase = 'loading';
		this.error = null;
		this.addError = null;

		try {
			const res = await fetch(`/api/v1/training/new?date=${encodeURIComponent(this.#date)}`, {
				signal: controller.signal
			});
			if (!res.ok) {
				throw new Error(await describeResponse(res, 'Could not load the sessions to add.'));
			}
			const options: NewTrainingOptions = await res.json();
			if (this.#request !== controller) return;

			this.candidates = options.candidates;
			this.phase = !options.canAdd ? 'full' : options.candidates.length ? 'ready' : 'empty';
		} catch (e) {
			// Closed, or asked again, while this one was out: the newer call owns
			// the state from here.
			if (isAbort(e) || this.#request !== controller) return;
			this.error = describeError(e, 'Could not load the sessions to add.');
			this.phase = 'failed';
		} finally {
			if (this.#request === controller) this.#request = null;
		}
	}

	close(): void {
		this.#request?.abort();
		this.#request = null;
		this.phase = 'closed';
		this.candidates = [];
		this.error = null;
		this.addError = null;
	}

	/** Add one of the listed candidates. True once it is on the plan. */
	async add(candidateId: number): Promise<boolean> {
		if (this.adding !== null) return false;
		this.adding = candidateId;
		this.addError = null;

		try {
			const res = await fetch('/api/v1/training/new', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ date: this.#date, candidateId })
			});
			if (!res.ok) {
				throw new Error(await describeResponse(res, 'Could not add this session.'));
			}
			const training: ScheduledTrainingDetail = await res.json();
			this.close();
			await this.#onAdded(training);
			return true;
		} catch (e) {
			this.addError = describeError(e, 'Could not add this session.');
			return false;
		} finally {
			this.adding = null;
		}
	}
}
