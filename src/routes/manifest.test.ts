import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The web app manifest, read as the browser reads it.
 *
 * Plain JSON in `static/`, so nothing type-checks it and nothing else would
 * notice it drift from the routes it points at.
 */
const manifest = JSON.parse(readFileSync('static/manifest.webmanifest', 'utf8')) as {
	id?: string;
	start_url: string;
	scope?: string;
};

const resolve = (path: string) => new URL(path, 'https://trainara.test/manifest.webmanifest').href;

describe('web app manifest', () => {
	/**
	 * `/` is a `load` that does nothing but redirect to the dashboard, so an
	 * installed app that started there paid a whole extra request — a function
	 * invocation, the session check in the hook, and the 302 — before the
	 * request for the page it was always going to show could even leave. On
	 * every launch from the home screen.
	 */
	it('opens the installed app on the dashboard rather than on a redirect', () => {
		expect(resolve(manifest.start_url)).toBe(resolve('/dashboard'));
	});

	/**
	 * Without an `id`, a browser derives the app's identity from `start_url`,
	 * so changing where the app opens would have made it a different app to
	 * every phone it is already installed on. Pinned to what it was derived as
	 * before (`/`), so the change of start page is an update, not a new app.
	 */
	it('keeps the identity the installed copies already have', () => {
		expect(manifest.id).toBeDefined();
		expect(resolve(manifest.id!)).toBe(resolve('/'));
	});

	it('keeps every page of the app inside its scope', () => {
		expect(resolve(manifest.scope ?? '.')).toBe(resolve('/'));
	});
});
