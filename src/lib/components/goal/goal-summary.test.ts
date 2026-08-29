import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/svelte';
import GoalSummary from './goal-summary.svelte';
import type { GoalSummary as Summary } from '$lib/utils/goal-summary';

afterEach(cleanup);

function summary(overrides: Partial<Summary> = {}): Summary {
	return {
		name: 'Autumn Marathon',
		distance: '42.2 km',
		weeks: 9,
		isPast: false,
		predictedTime: '3:42:15',
		predictedPace: '5:16 /km',
		...overrides
	};
}

function mount(overrides: Partial<Summary> = {}, expanded = false) {
	const toggled: number[] = [];
	render(GoalSummary, {
		props: {
			summary: summary(overrides),
			expanded,
			controls: 'goal-details',
			ontoggle: () => toggled.push(1)
		}
	});
	return { toggled, button: screen.getByRole('button') };
}

describe('goal summary strip', () => {
	it('shows the name, the distance, the countdown and the live prediction', () => {
		const { button } = mount();
		expect(button.textContent).toContain('Autumn Marathon');
		expect(button.textContent).toContain('42.2 km');
		expect(button.textContent).toContain('9 weeks to go');
		expect(button.textContent).toContain('3:42:15');
		expect(button.textContent).toContain('5:16 /km');
	});

	it('labels both numbers, so neither reads as the goal it is measured against', () => {
		const { button } = mount();
		expect(button.textContent).toContain('Predicted time');
		expect(button.textContent).toContain('Predicted pace');
	});

	it('leaves out the distance rather than an empty separator', () => {
		const { button } = mount({ distance: null });
		expect(button.textContent).toContain('9 weeks to go');
		expect(button.textContent).not.toContain('|');
	});

	it('says the same thing to a screen reader as it shows on screen', () => {
		const { button } = mount();
		const label = button.getAttribute('aria-label') ?? '';
		expect(label).toContain('Autumn Marathon');
		expect(label).toContain('9 weeks to go');
		expect(label).toContain('42.2 km');
		expect(label).toContain('predicted time 3:42:15');
		expect(label).toContain('5:16 /km');
	});

	it('reports its state and what it opens', async () => {
		const { button, toggled } = mount();
		expect(button.getAttribute('aria-expanded')).toBe('false');
		expect(button.getAttribute('aria-controls')).toBe('goal-details');

		await fireEvent.click(button);
		expect(toggled).toHaveLength(1);
	});

	it('reads as open when it is open', () => {
		const { button } = mount({}, true);
		expect(button.getAttribute('aria-expanded')).toBe('true');
	});

	it('counts a single week in the singular', () => {
		const { button } = mount({ weeks: 1 });
		expect(button.textContent).toContain('1 week to go');
		expect(button.textContent).not.toContain('1 weeks');
	});

	it('calls the last week race week rather than "0 weeks to go"', () => {
		const { button } = mount({ weeks: 0 });
		expect(button.textContent).toContain('Race week');
	});

	it('reads a finished goal as a result, not a countdown', () => {
		const { button } = mount({ isPast: true, weeks: 0 });
		expect(button.textContent).toContain('Completed');
		expect(button.textContent).not.toContain('to go');
	});

	it('says so plainly when there is no prediction yet', () => {
		const { button } = mount({ predictedTime: null, predictedPace: null });
		expect(button.textContent).toContain('No prediction yet');
		expect(button.getAttribute('aria-label')).toContain('no prediction yet');
	});

	it('drops a stray pace when there is no time to attach it to', () => {
		const { button } = mount({ predictedTime: null });
		expect(button.textContent).not.toContain('5:16');
		expect(button.textContent).not.toContain('Predicted pace');
	});

	it('keeps the time on its own when the pace is the missing half', () => {
		const { button } = mount({ predictedPace: null });
		expect(button.textContent).toContain('3:42:15');
		expect(button.textContent).toContain('Predicted time');
		expect(button.textContent).not.toContain('Predicted pace');
	});
});
