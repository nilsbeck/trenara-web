// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import Calendar from './calendar.svelte';
import type { Entry, Schedule, ScheduledTraining } from '#lib/server/trenara/types.js';

/**
 * The calendar as the server renders it — what a runner sees before any of
 * the page's JavaScript has arrived.
 *
 * The rest of the suite mounts components into jsdom, where effects run, so
 * it could not see that the schedule and the opening day were both seated by
 * effects and therefore missing from the server's HTML altogether. This file
 * runs under Node and renders with `svelte/server`, where effects never run.
 */

// Wednesday 2026-08-26.
const TODAY = new Date(2026, 7, 26, 8, 0);

function training(day: string, title: string) {
	return {
		id: Number(day.replaceAll('-', '')),
		day_long: day,
		title,
		blocks: []
	} as unknown as ScheduledTraining;
}

function run(day: string, name: string) {
	return {
		id: 900,
		type: 'run',
		name,
		start_time: `${day}T07:00:00+02:00`,
		rpe: 6
	} as unknown as Entry;
}

function schedule(partial: Partial<Schedule>): Schedule {
	return {
		id: 1,
		start_day: 0,
		start_day_long: '2026-08-24',
		training_week: 10,
		type: 'ultimate',
		trainings: [],
		strength_trainings: [],
		entries: [],
		...partial
	} as unknown as Schedule;
}

/** The rendered text, with markup and Svelte's hydration comments stripped. */
function textOf(html: string): string {
	return html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

describe('the calendar, rendered on the server', () => {
	it("shows the opening day's session in the first paint", () => {
		const { body } = render(Calendar, {
			props: {
				today: TODAY,
				schedule: schedule({ trainings: [training('2026-08-26', 'Tempo intervals')] })
			}
		});

		expect(textOf(body)).toContain('Tempo intervals');
	});

	it('opens on the same day the browser will, so hydration has nothing to move', () => {
		// A session two days out and nothing today: `initialCalendarDay` moves
		// the pick forward to the next session, and the server has to agree.
		const { body } = render(Calendar, {
			props: {
				today: TODAY,
				schedule: schedule({ trainings: [training('2026-08-28', 'Long run')] })
			}
		});

		expect(textOf(body)).toContain('Long run');
	});

	it('renders a day that already has a run logged against it', () => {
		const { body } = render(Calendar, {
			props: {
				today: TODAY,
				schedule: schedule({
					trainings: [training('2026-08-26', 'Easy run')],
					entries: [run('2026-08-26', 'Morning run')]
				})
			}
		});

		expect(textOf(body)).toContain('Easy run');
	});

	/**
	 * A phone's media query folds the calendar to one week, and that used to
	 * happen only once the page had hydrated: the server drew the month, and a
	 * six-row grid collapsed to one row on every launch, shoving the session
	 * underneath up the screen. The page now tells the calendar which view the
	 * screen will ask for, and the server draws that one.
	 */
	it('draws the folded week when the page says the screen is a phone', () => {
		const { body } = render(Calendar, {
			props: {
				today: TODAY,
				schedule: schedule({ trainings: [training('2026-08-26', 'Tempo intervals')] }),
				openingView: 'week'
			}
		});

		const text = textOf(body);
		expect(text).toContain('24 – 30 August 2026');
		// One row of seven days, not the month's thirty-one.
		expect(text).toMatch(/Sun 24 25 26 27 28 29 30/);
		expect(text).not.toMatch(/Sun 1 2 3/);
		expect(text).toContain('Tempo intervals');
	});

	it('folds onto the week of the day it opens on, not the week of today', () => {
		// Nothing today; the next session is the following Tuesday.
		const { body } = render(Calendar, {
			props: {
				today: TODAY,
				schedule: schedule({ trainings: [training('2026-09-01', 'Long run')] }),
				openingView: 'week'
			}
		});

		expect(textOf(body)).toContain('31 Aug – 6 Sep 2026');
	});

	it('draws the month when the page says nothing', () => {
		const { body } = render(Calendar, {
			props: { today: TODAY, schedule: schedule({ trainings: [training('2026-08-26', 'Tempo')] }) }
		});

		expect(textOf(body)).toMatch(/August 2026 Mon Tue Wed Thu Fri Sat Sun 1 2 3/);
	});

	it('still renders an empty plan rather than failing the page', () => {
		const { body } = render(Calendar, { props: { today: TODAY, schedule: schedule({}) } });

		expect(textOf(body)).toContain('August 2026');
	});
});
