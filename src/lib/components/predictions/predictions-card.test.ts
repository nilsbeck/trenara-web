import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen, within, fireEvent } from '@testing-library/svelte';
import PredictionsCard from './predictions-card.svelte';
import type { UserStats } from '$lib/server/trenara/types';

afterEach(cleanup);

/** One real `best_times` block. Every figure in it sits on the same curve. */
const userStats = {
	best_times: {
		distance_unit: 'km',
		pace_unit: 'min/km',
		pace_for_5: '03:54',
		time_for_5: '00:19:29',
		pace_for_10: '04:05',
		time_for_10: '00:40:56',
		pace_for_half_marathon: '04:18',
		time_for_half_marathon: '01:31:04',
		pace_for_marathon: '04:32',
		time_for_marathon: '03:11:18',
		pace_for_goal: '04:12',
		time_for_goal: '01:03:12'
	}
} as unknown as UserStats;

function slider(): HTMLInputElement {
	return screen.getByLabelText('Any distance') as HTMLInputElement;
}

/**
 * The slider panel alone. The table above it prints "21.1 km" too, and a
 * readout asserted against the whole card would pass on the table's copy.
 */
function panel() {
	return within(screen.getByTestId('any-distance'));
}

describe('the distance slider', () => {
	it('agrees with the table it sits under', async () => {
		// The slider is only defensible if it reproduces the API's own numbers at
		// the distances the API states: a readout that contradicted the four rows
		// above it would be worse than no readout.
		render(PredictionsCard, { userStats });

		for (const [km, time] of [
			[5, '19:29'],
			[10, '40:56'],
			[21.0975, '1:31:04'],
			[42.195, '3:11:18']
		] as const) {
			await fireEvent.input(slider(), { target: { value: String(km) } });
			expect(panel().getByText(time)).toBeInTheDocument();
		}
	});

	it('answers a distance the API never states', async () => {
		// 15 km, against the 1:03:12 the same response gives for a 15 km goal.
		render(PredictionsCard, { userStats });

		await fireEvent.input(slider(), { target: { value: '15' } });

		expect(panel().getByText('1:03:12')).toBeInTheDocument();
		expect(panel().getByText('15 km')).toBeInTheDocument();
	});

	it('lands exactly on a marquee distance dragged near', async () => {
		// The step is a tenth of a kilometre, so the half marathon is otherwise
		// unreachable — and 21.1 km reading a few seconds off the row above it is
		// the one thing that would make the whole panel look wrong.
		render(PredictionsCard, { userStats });

		await fireEvent.input(slider(), { target: { value: '21.2' } });

		expect(panel().getByText('21.1 km')).toBeInTheDocument();
		expect(panel().getByText('1:31:04')).toBeInTheDocument();
	});

	it('says when it is carrying the curve past what the API states', async () => {
		render(PredictionsCard, { userStats });

		await fireEvent.input(slider(), { target: { value: '50' } });
		expect(panel().getByText(/carried\s+past the distances it was read from/)).toBeInTheDocument();

		await fireEvent.input(slider(), { target: { value: '30' } });
		expect(
			panel().queryByText(/carried\s+past the distances it was read from/)
		).not.toBeInTheDocument();
	});

	it('carries the reading in the control for a screen reader', async () => {
		render(PredictionsCard, { userStats });

		await fireEvent.input(slider(), { target: { value: '10' } });

		expect(slider()).toHaveAttribute('aria-valuetext', '10 km, 40:56');
	});
});

// ─────────────────────────────────────────────────────────────
// An account the API has no predictions for yet
//
// `best_times` is typed as a block of strings because that is what every
// capture of an established account has held. A runner who has just signed
// up has no best times to predict from, and the fields came back null —
// which `timeStringToSeconds` met with `null.split(':')`, taking down the
// card mid-render.
// ─────────────────────────────────────────────────────────────
describe('a best_times block with nothing in it', () => {
	const empty = {
		best_times: {
			distance_unit: 'km',
			pace_unit: 'min/km',
			pace_for_5: null,
			time_for_5: null,
			pace_for_10: null,
			time_for_10: null,
			pace_for_half_marathon: null,
			time_for_half_marathon: null,
			pace_for_marathon: null,
			time_for_marathon: null,
			pace_for_goal: null,
			time_for_goal: null
		}
	} as unknown as UserStats;

	it('renders the card instead of throwing', () => {
		expect(() => render(PredictionsCard, { userStats: empty })).not.toThrow();
		expect(screen.getByText('Race Predictions')).toBeTruthy();
	});

	it('still names every distance, with the times marked absent', () => {
		render(PredictionsCard, { userStats: empty });

		for (const distance of ['5 km', '10 km', '21.1 km', '42.2 km']) {
			expect(screen.getByText(distance)).toBeTruthy();
		}
		// Two cells a row, four rows, none of them a time.
		expect(screen.getAllByText('-')).toHaveLength(8);
	});

	// There is no curve to read without at least one prediction on it, so the
	// slider is not offered rather than offered reading nothing.
	it('leaves out the slider it has no curve for', () => {
		render(PredictionsCard, { userStats: empty });
		expect(screen.queryByTestId('any-distance')).toBeNull();
	});
});

describe('a best_times block with only some rows filled in', () => {
	it('reads the curve off the rows that are there', () => {
		// A runner with a 5 km and a 10 km but no long races yet.
		const partial = {
			best_times: {
				distance_unit: 'km',
				pace_unit: 'min/km',
				pace_for_5: '03:54',
				time_for_5: '00:19:29',
				pace_for_10: '04:05',
				time_for_10: '00:40:56',
				pace_for_half_marathon: null,
				time_for_half_marathon: null,
				pace_for_marathon: '--:--',
				time_for_marathon: '--:--',
				pace_for_goal: null,
				time_for_goal: null
			}
		} as unknown as UserStats;

		render(PredictionsCard, { userStats: partial });

		// The two real rows are enough for a slope, so the slider is offered.
		expect(screen.getByTestId('any-distance')).toBeTruthy();
		// And it reproduces the 10 km the table states, rather than being
		// dragged off by the placeholder rows parsing as a time of zero.
		expect(panel().getByText('40:56')).toBeTruthy();
	});
});
