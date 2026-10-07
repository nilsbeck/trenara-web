import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import TrainingDetails from '$lib/components/calendar/training-details.svelte';
import type { Entry, ScheduledTraining } from '$lib/server/trenara/types';

// The fields that matter here, from a week capture of 2026-10-07: a session
// the backend lengthened from 10km to 11km, and its note about that.
const adjusted = {
	id: 42,
	day: 0,
	day_long: '2026-08-22',
	title: 'Easy run + strides',
	description: 'Stay aerobic today.',
	show_description_from: 0,
	type: 'training',
	icon_url: '',
	hex_training: '#7B3FA0',
	hex_completed: null,
	last_garmin_sync: null,
	can_be_edited: true,
	has_intelligence: true,
	intelligence_text:
		'I’ve adjusted your training, Nils. The new distance of 11km is therefore a little longer.\n\nNot feeling quite as good today? You can still shorten the workout a little.\n',
	original_distance_km: 10,
	base_distance: 11000,
	intelligence_distance: '-1000m',
	intelligence_distance_value: -1000,
	intelligence_distance_unit: 'm',
	intelligence_distance_unit_text: 'm',
	training: {
		blocks: [],
		total_time_in_sec: 3211,
		core_time_in_sec: 3211,
		core_time: '53:31',
		core_time_value: 3211,
		core_time_unit: 'sec',
		total_distance: '11km',
		total_distance_value: 11,
		total_distance_unit: 'km',
		total_time: '53:31',
		total_time_value: 3211,
		total_time_unit: 'sec'
	}
} as ScheduledTraining;

const switchedOff: ScheduledTraining = {
	...adjusted,
	has_intelligence: false,
	intelligence_text: null,
	base_distance: null,
	intelligence_distance: null,
	intelligence_distance_value: null,
	intelligence_distance_unit: null,
	intelligence_distance_unit_text: null
};

beforeEach(() => {
	// The detail fetch is beside the point here; a pending one keeps the week's copy on screen.
	vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('training-details Trenara Intelligence', () => {
	it('shows the note on a session the backend adjusted', () => {
		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: adjusted, entry: null, isLoading: false }
		});
		const note = screen.getByRole('region', { name: 'Trenara Intelligence' });
		expect(note.textContent).toContain('I’ve adjusted your training, Nils.');
		expect(note.textContent).toContain('You can still shorten the workout a little.');
		// Apart from the coach's own message, not merged into it.
		expect(note.textContent).not.toContain('Stay aerobic today.');
		expect(screen.getByText('Stay aerobic today.')).toBeTruthy();
	});

	it('draws nothing when intelligence is switched off', () => {
		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: switchedOff, entry: null, isLoading: false }
		});
		expect(screen.queryByTestId('intelligence-note')).toBeNull();
	});

	it('drops the note once the session has been run', () => {
		const entry = { id: 555, type: 'run', rpe: 5 } as unknown as Entry;
		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: adjusted, entry, isLoading: false }
		});
		expect(screen.queryByTestId('intelligence-note')).toBeNull();
	});
});
