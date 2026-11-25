// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import OfflinePage from './+page.svelte';

/**
 * The offline page as it is prerendered — the HTML on the device before any
 * of its script runs.
 *
 * That HTML is built once, for everyone, so it cannot know whether this
 * device kept a plan. It has to say it is looking rather than say there is
 * none, and it must already carry the banner: the one thing never in doubt on
 * this page is that what follows is not live.
 */
describe('the prerendered offline page', () => {
	it('is looking for the saved plan, not reporting that there is none', () => {
		const { body } = render(OfflinePage);

		expect(body).toContain('data-testid="offline-plan-loading"');
		expect(body).toContain('Looking for your saved plan');
		expect(body).not.toContain('none was saved');
	});

	it('carries the offline banner from the first paint', () => {
		const { body } = render(OfflinePage);

		expect(body).toContain('data-testid="offline-banner"');
		expect(body).toContain('>Offline<');
	});
});
