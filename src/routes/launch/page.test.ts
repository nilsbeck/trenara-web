import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen, within } from '@testing-library/svelte';
import Page from './+page.svelte';
import * as options from './+page.js';

/**
 * The launch placeholder: what a slow start shows while the dashboard is on
 * its way. The service worker serves it from disk and hands over to the real
 * dashboard (`src/service-worker/index.test.ts` covers that side).
 */

afterEach(() => cleanup());

describe('launch placeholder', () => {
	it('says the plan is loading, in words a screen reader announces', () => {
		render(Page);

		const status = screen.getByRole('status');
		expect(status.textContent?.trim()).toBe('Loading your plan…');
		// The spinner is decoration; the sentence is what is said.
		const spinner = status.querySelector('svg');
		expect(spinner?.getAttribute('aria-hidden')).toBe('true');
		expect(spinner?.getAttribute('class')).toMatch(/\banimate-spin\b/);
	});

	it('draws the app’s own navbar, so it does not move when the dashboard replaces it', () => {
		render(Page);

		const nav = screen.getByRole('navigation');
		expect(within(nav).getByRole('link').getAttribute('href')).toBe('/dashboard');
		expect(nav.textContent).toContain('Trainara');
	});

	it('holds a place for each card the dashboard draws first', () => {
		render(Page);

		expect(screen.getByTestId('launch-goal-card')).toBeTruthy();
		expect(screen.getByTestId('launch-placeholder')).toBeTruthy();
		expect(screen.getByTestId('launch-day')).toBeTruthy();
	});

	it('offers nothing to press but the way to the dashboard', () => {
		// Its account menu is a footprint: there is no menu to open yet, and a
		// button that does nothing on a slow start reads as a broken app.
		render(Page);

		expect(screen.queryAllByRole('button')).toHaveLength(0);
		expect(screen.getAllByRole('link')).toHaveLength(1);
	});

	it('hands over to the dashboard as soon as it has loaded', () => {
		render(Page);

		const refresh = document.head.querySelector('meta[http-equiv="refresh"]');
		// To the dashboard by name, never a bare refresh: opened directly, a
		// bare one would reload `/launch` for ever.
		expect(refresh?.getAttribute('content')).toBe('0; url=/dashboard');
	});

	it('keeps itself out of search results', () => {
		render(Page);

		expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
			'noindex'
		);
	});
});

describe('launch placeholder — how it is built', () => {
	it('is prerendered, so the service worker can keep it from install', () => {
		expect(options.prerender).toBe(true);
	});

	it('ships no JavaScript: it leaves by a meta refresh, not a router', () => {
		expect(options.csr).toBe(false);
	});
});
