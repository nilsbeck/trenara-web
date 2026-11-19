import { afterEach, describe, expect, it, vi } from 'vitest';
import { externalLinkTarget, isInstalledApp } from './external-link';

/** A display mode, as far as `matchMedia` is concerned. */
function displayMode(standalone: boolean) {
	vi.stubGlobal('matchMedia', (query: string) => ({
		matches: standalone && query === '(display-mode: standalone)',
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {}
	}));
}

afterEach(() => {
	vi.unstubAllGlobals();
	Reflect.deleteProperty(navigator, 'standalone');
});

describe('externalLinkTarget', () => {
	it('opens a new tab in a browser', () => {
		displayMode(false);
		expect(isInstalledApp()).toBe(false);
		expect(externalLinkTarget()).toBe('_blank');
	});

	it('navigates in place in the installed app, where _blank reopened the app', () => {
		displayMode(true);
		expect(isInstalledApp()).toBe(true);
		expect(externalLinkTarget()).toBeUndefined();
	});

	it("reads iOS's own standalone flag", () => {
		displayMode(false);
		Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
		expect(externalLinkTarget()).toBeUndefined();
	});

	it('treats a browser without matchMedia as a browser', () => {
		vi.stubGlobal('matchMedia', undefined);
		expect(externalLinkTarget()).toBe('_blank');
	});
});
