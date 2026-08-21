import { describe, it, expect } from 'vitest';
import { archiveGoalSchema } from './goal-history';

const validGoal = {
	goal_name: 'Marathon Berlin',
	distance: '42.195 km',
	goal_time: '3:45:00',
	goal_pace: '5:20',
	final_predicted_time: '3:42:00',
	final_predicted_pace: '5:16',
	start_date: '2025-01-06',
	end_date: '2025-09-28'
};

describe('archiveGoalSchema', () => {
	it('accepts the unpadded times and paces Trenara reports', () => {
		expect(archiveGoalSchema.safeParse(validGoal).success).toBe(true);
	});

	it('accepts zero-padded times and paces', () => {
		expect(
			archiveGoalSchema.safeParse({ ...validGoal, goal_time: '03:45:00', goal_pace: '05:20' })
				.success
		).toBe(true);
	});

	it('accepts MM:SS goal times for short-distance goals', () => {
		expect(archiveGoalSchema.safeParse({ ...validGoal, goal_time: '22:30' }).success).toBe(true);
	});

	it('strips the pace unit suffix', () => {
		const result = archiveGoalSchema.safeParse({ ...validGoal, goal_pace: '5:20 min/km' });
		expect(result.success).toBe(true);
		expect(result.data?.goal_pace).toBe('5:20');
	});

	it('strips the pace unit suffix from the final prediction too', () => {
		const result = archiveGoalSchema.safeParse({
			...validGoal,
			final_predicted_pace: '5:16 min/mi'
		});
		expect(result.success).toBe(true);
		expect(result.data?.final_predicted_pace).toBe('5:16');
	});

	it('allows the final prediction to be null', () => {
		expect(
			archiveGoalSchema.safeParse({
				...validGoal,
				final_predicted_time: null,
				final_predicted_pace: null
			}).success
		).toBe(true);
	});

	it('allows the final prediction to be omitted', () => {
		const { final_predicted_time: _t, final_predicted_pace: _p, ...rest } = validGoal;
		expect(archiveGoalSchema.safeParse(rest).success).toBe(true);
	});

	it('rejects a non-numeric time', () => {
		expect(archiveGoalSchema.safeParse({ ...validGoal, goal_time: 'abc' }).success).toBe(false);
	});

	it('rejects a pace with seconds', () => {
		expect(archiveGoalSchema.safeParse({ ...validGoal, goal_pace: '5:20:00' }).success).toBe(false);
	});

	it('rejects a malformed date', () => {
		expect(archiveGoalSchema.safeParse({ ...validGoal, end_date: '28-09-2025' }).success).toBe(
			false
		);
	});

	it('rejects an empty goal name', () => {
		expect(archiveGoalSchema.safeParse({ ...validGoal, goal_name: '' }).success).toBe(false);
	});
});
