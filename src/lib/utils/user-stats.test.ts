import { describe, it, expect } from 'vitest';
import { isRenderableStats } from './user-stats';
import type { UserStats } from '$lib/server/trenara/types';

const stats = (partial: Partial<UserStats>) => partial as UserStats;

describe('isRenderableStats', () => {
	it('accepts a payload carrying the block the cards read', () => {
		expect(isRenderableStats(stats({ best_times: { pace_unit: 'min/km' } as never }))).toBe(true);
	});

	it('rejects nothing at all', () => {
		expect(isRenderableStats(null)).toBe(false);
		expect(isRenderableStats(undefined)).toBe(false);
	});

	it('rejects a truthy response that is not a stats payload', () => {
		// What an upstream error page or an empty body deserialises to. This is
		// the case that used to render the cards and throw mid-render.
		expect(isRenderableStats(stats({}))).toBe(false);
		expect(isRenderableStats([] as unknown as UserStats)).toBe(false);
	});

	it('accepts a payload with no graphs — empty graphs still render', () => {
		expect(
			isRenderableStats(
				stats({ best_times: { pace_unit: 'min/km' } as never, graph_stats: undefined })
			)
		).toBe(true);
	});
});
