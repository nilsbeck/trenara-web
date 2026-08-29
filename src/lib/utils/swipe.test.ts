import { describe, it, expect } from 'vitest';
import {
	followOffset,
	isHorizontalSwipe,
	swipeStep,
	SWIPE_ACTIVATION,
	SWIPE_MAX_FOLLOW,
	SWIPE_THRESHOLD
} from './swipe';

describe('isHorizontalSwipe', () => {
	it('ignores a movement too small to be anything but a tap', () => {
		expect(isHorizontalSwipe(SWIPE_ACTIVATION - 1, 0)).toBe(false);
		expect(isHorizontalSwipe(-(SWIPE_ACTIVATION - 1), 0)).toBe(false);
	});

	it('claims a flat movement once it has gone far enough, either way', () => {
		expect(isHorizontalSwipe(SWIPE_ACTIVATION, 2)).toBe(true);
		expect(isHorizontalSwipe(-40, 5)).toBe(true);
	});

	it('leaves a steeper movement to the page, however far it has gone', () => {
		expect(isHorizontalSwipe(40, 60)).toBe(false);
		expect(isHorizontalSwipe(-40, -60)).toBe(false);
	});

	it('leaves a movement that is exactly diagonal to the page', () => {
		expect(isHorizontalSwipe(40, 40)).toBe(false);
	});
});

describe('followOffset', () => {
	it('follows the finger at less than its own pace', () => {
		expect(followOffset(40)).toBe(20);
		expect(followOffset(-40)).toBe(-20);
	});

	it('stops following past the limit, in both directions', () => {
		expect(followOffset(10_000)).toBe(SWIPE_MAX_FOLLOW);
		expect(followOffset(-10_000)).toBe(-SWIPE_MAX_FOLLOW);
	});

	it('sits still for no travel at all', () => {
		expect(followOffset(0)).toBe(0);
	});
});

describe('swipeStep', () => {
	it('reads a drag to the left as a step forward', () => {
		expect(swipeStep(-SWIPE_THRESHOLD)).toBe('next');
		expect(swipeStep(-200)).toBe('next');
	});

	it('reads a drag to the right as a step back', () => {
		expect(swipeStep(SWIPE_THRESHOLD)).toBe('previous');
		expect(swipeStep(200)).toBe('previous');
	});

	it('asks for nothing when the drag stopped short', () => {
		expect(swipeStep(SWIPE_THRESHOLD - 1)).toBeNull();
		expect(swipeStep(-(SWIPE_THRESHOLD - 1))).toBeNull();
		expect(swipeStep(0)).toBeNull();
	});
});
