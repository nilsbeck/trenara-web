import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/svelte';
import type { AppConfig } from '$lib/server/trenara/types';
import { appConfig } from '$lib/stores/app-config.svelte';
import PlanControls from './plan-controls.svelte';

/**
 * The plan controls, and the paused state they report.
 *
 * A paused plan looks entirely normal on every other screen — the weeks are
 * still there, the goal card still reads the same — so this banner is the only
 * place the app says it out loud. That, and the fact that pausing is not
 * offered twice, is what these cover.
 */

beforeAll(() => {
	HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
		this.open = true;
	};
	HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
		this.open = false;
	};
});

beforeEach(() => appConfig.set(null));

afterEach(() => {
	cleanup();
	appConfig.set(null);
});

describe('plan controls', () => {
	it('offers a pause while the plan is running', () => {
		render(PlanControls, { props: { paused: false, onchanged: vi.fn() } });

		expect(screen.getByRole('button', { name: /pause plan/i })).toBeTruthy();
		expect(screen.queryByTestId('plan-paused')).toBeNull();
	});

	it('always offers the delete', () => {
		render(PlanControls, { props: { paused: false, onchanged: vi.fn() } });
		expect(screen.getByRole('button', { name: /delete goal/i })).toBeTruthy();
	});

	// Pausing a paused plan is a request with nowhere to go; the state is what
	// wants saying instead.
	it('drops the pause control once the plan is paused', () => {
		render(PlanControls, { props: { paused: true, onchanged: vi.fn() } });

		expect(screen.queryByRole('button', { name: /pause plan/i })).toBeNull();
		expect(screen.getByTestId('plan-paused')).toBeTruthy();
	});

	it('names the reason and the date it started', () => {
		render(PlanControls, {
			props: {
				paused: true,
				// 2026-08-31 in unix seconds, as `/api/me` sends it.
				pausedSince: 1788213600,
				pauseCause: 'other',
				onchanged: vi.fn()
			}
		});

		const banner = screen.getByTestId('plan-paused');
		expect(banner.textContent).toMatch(/other/i);
		expect(banner.textContent).toMatch(/paused since/i);
		expect(banner.textContent).toMatch(/2026/);
	});

	it('labels the reason from the served list when there is one', () => {
		appConfig.set({
			pause_types: [{ order: 1, type: 'other', title: 'Anders', ask_extra_input: true }]
		} as unknown as AppConfig);

		render(PlanControls, { props: { paused: true, pauseCause: 'other', onchanged: vi.fn() } });

		expect(screen.getByTestId('plan-paused').textContent).toMatch(/anders/i);
	});

	// `paused_since` is nullable upstream, and "Paused since Invalid Date" is
	// worse than not saying when.
	it('says nothing about a date it does not have', () => {
		render(PlanControls, { props: { paused: true, pausedSince: null, onchanged: vi.fn() } });

		const banner = screen.getByTestId('plan-paused');
		expect(banner.textContent).not.toMatch(/paused since/i);
		expect(banner.textContent).toMatch(/trenara app/i);
	});

	// There is no captured resume endpoint, so the banner has to point somewhere
	// real rather than offer a button that guesses at a path.
	it('says where the plan can be picked back up', () => {
		render(PlanControls, { props: { paused: true, onchanged: vi.fn() } });

		expect(screen.getByTestId('plan-paused').textContent).toMatch(
			/pick it back up in the trenara app/i
		);
	});
});
