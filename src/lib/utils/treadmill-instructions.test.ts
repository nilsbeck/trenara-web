import { describe, it, expect } from 'vitest';
import { buildTreadmillInstructions } from './treadmill-instructions';
import type { ScheduledTraining, TrainingBlock } from '$lib/server/trenara/types';

// ── Helpers ───────────────────────────────────────────────────
function makeBlock(overrides: Partial<TrainingBlock> = {}): TrainingBlock {
	return {
		order: 1,
		type: 'run',
		time: '10:00',
		time_in_sec: 600,
		time_value: 10,
		time_unit: 'min',
		distance: '2km',
		distance_value: 2,
		distance_unit: 'km',
		distance_unit_text: 'km',
		pace: '5:00',
		pace_value: 5,
		pace_unit: 'min/km',
		text: 'Run 2km',
		...overrides
	};
}

function makeTraining(blocks: TrainingBlock[]): ScheduledTraining {
	return {
		id: 1,
		day: 0,
		day_long: '2025-03-03',
		title: 'Easy run',
		description: '',
		show_description_from: 0,
		nutritional_advice: '',
		type: 'run',
		icon_url: '',
		hex_training: '#000000',
		hex_completed: null,
		training: {
			blocks,
			total_time_in_sec: 0,
			core_time_in_sec: 0,
			core_distance: '',
			core_distance_value: 0,
			core_distance_unit: 'km',
			core_distance_unit_text: 'km',
			core_time: '',
			core_time_value: 0,
			core_time_unit: 'min',
			total_distance: '',
			total_distance_value: 0,
			total_distance_unit: 'km',
			total_distance_unit_text: 'km',
			total_time: '',
			total_time_value: 0,
			total_time_unit: 'min'
		},
		last_garmin_sync: '',
		can_be_edited: true,
		training_condition: {
			id: 1,
			height_difference: '0',
			surface: 'road',
			updated_at: 0,
			height: null,
			height_value: null,
			height_unit: null,
			height_unit_text: null
		}
	};
}

// ─────────────────────────────────────────────────────────────
// buildTreadmillInstructions
// ─────────────────────────────────────────────────────────────
describe('buildTreadmillInstructions', () => {
	it('returns an empty array when there are no blocks', () => {
		expect(buildTreadmillInstructions(makeTraining([]))).toEqual([]);
	});

	it('converts a simple block into a single instruction with speed in km/h', () => {
		const training = makeTraining([
			makeBlock({ text: 'Warm up', pace_value: 6, pace_unit: 'min/km' })
		]);
		const result = buildTreadmillInstructions(training);

		expect(result).toHaveLength(1);
		expect(result[0].title).toBe('Warm up');
		expect(result[0].speedLabel).toBe('10.0 km/h');
	});

	it('omits speed for blocks without a pace (e.g. rest)', () => {
		const training = makeTraining([
			makeBlock({ text: 'Rest', type: 'rest', pace: '', pace_value: 0 })
		]);
		const result = buildTreadmillInstructions(training);

		expect(result[0].speedLabel).toBeNull();
	});

	it('preserves the order of multiple top-level blocks', () => {
		const training = makeTraining([
			makeBlock({ order: 1, text: 'Warm up' }),
			makeBlock({ order: 2, text: 'Core run' }),
			makeBlock({ order: 3, text: 'Cool down' })
		]);
		const result = buildTreadmillInstructions(training);

		expect(result.map((i) => i.title)).toEqual(['Warm up', 'Core run', 'Cool down']);
	});

	it('expands a composite block with repeat > 1 into one instruction per repetition', () => {
		const training = makeTraining([
			{
				...makeBlock({ text: '4 x (800m fast + 400m recovery)' }),
				repeat: 4,
				blocks: [
					makeBlock({ text: '800m fast', type: 'interval', pace_value: 4 }),
					makeBlock({ text: '400m recovery', type: 'recovery', pace_value: 7 })
				]
			}
		]);
		const result = buildTreadmillInstructions(training);

		// 4 repeats x 2 sub-blocks = 8 instructions
		expect(result).toHaveLength(8);
		expect(result.map((i) => i.title)).toEqual([
			'800m fast',
			'400m recovery',
			'800m fast',
			'400m recovery',
			'800m fast',
			'400m recovery',
			'800m fast',
			'400m recovery'
		]);
		expect(result[0].repeatIndex).toBe(1);
		expect(result[0].repeatTotal).toBe(4);
		expect(result[0].groupLabel).toBe('4 x (800m fast + 400m recovery)');
		expect(result[6].repeatIndex).toBe(4); // 7th instruction = start of 4th repeat
	});

	it('does not set repeatIndex/repeatTotal when a composite block has no meaningful repeat', () => {
		const training = makeTraining([
			{
				...makeBlock({ text: 'Block' }),
				repeat: 1,
				blocks: [makeBlock({ text: 'Sub block' })]
			}
		]);
		const result = buildTreadmillInstructions(training);

		expect(result[0].repeatIndex).toBeUndefined();
		expect(result[0].repeatTotal).toBeUndefined();
	});

	it('falls back to the pace string when pace_value is not set', () => {
		const training = makeTraining([
			makeBlock({ text: 'Tempo', pace_value: 0, pace: '4:30', pace_unit: 'min/km' })
		]);
		const result = buildTreadmillInstructions(training);

		expect(result[0].speedLabel).toBe('13.3 km/h');
	});

	it('falls back to the block type as the title when text is missing', () => {
		const training = makeTraining([makeBlock({ text: '', type: 'jog' })]);
		const result = buildTreadmillInstructions(training);

		expect(result[0].title).toBe('jog');
	});
});
