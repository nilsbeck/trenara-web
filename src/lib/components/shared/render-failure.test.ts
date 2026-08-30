import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/svelte';
import RenderFailure from './render-failure.svelte';
import BoundaryFixture from './boundary.fixture.svelte';
import Thrower from './thrower.fixture.svelte';

afterEach(cleanup);

beforeEach(() => {
	// Svelte reports a caught error to the console on its way into the
	// boundary. That is the point of it; it should not colour the test output.
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('a component that throws while rendering', () => {
	// Proves the rest of this block is testing the boundary and not a child
	// that quietly declines to fail: unwrapped, the same component takes the
	// render down with it.
	it('takes the render down when nothing is catching it', () => {
		expect(() => render(Thrower, { shouldThrow: true })).toThrow(/reading 'split'/);
	});

	// The half this app was missing. The server's failures have had an error
	// page since the connection work; a component throwing after hydration was
	// caught by nothing, leaving the screen half-drawn.
	it('is contained rather than left half-drawn', () => {
		expect(() => render(BoundaryFixture, { shouldThrow: true })).not.toThrow();
		expect(screen.getByTestId('render-failure')).toBeTruthy();
		expect(screen.queryByText('the component rendered')).toBeNull();
	});

	// The whole reason the boundary sits around the page rather than the app:
	// the runner can still navigate away from a screen that will not draw.
	it('leaves everything outside it alone', () => {
		render(BoundaryFixture, { shouldThrow: true });
		expect(screen.getByText('the navbar')).toBeTruthy();
	});

	it('renders the component normally when it does not throw', () => {
		render(BoundaryFixture, { shouldThrow: false });
		expect(screen.getByText('the component rendered')).toBeTruthy();
		expect(screen.queryByTestId('render-failure')).toBeNull();
	});
});

describe('the fallback itself', () => {
	it('says which part failed and that the rest still works', () => {
		render(RenderFailure, { title: 'This page could not be shown' });

		expect(screen.getByText('This page could not be shown')).toBeTruthy();
		expect(screen.getByText(/rest of the app is unaffected/)).toBeTruthy();
	});

	it('announces itself to a screen reader as an alert', () => {
		render(RenderFailure, {});
		expect(screen.getByRole('alert')).toBeTruthy();
	});

	// Branches are tried as Vercel preview deployments, where a browser console
	// is not somewhere anyone thinks to look — so the failure is on screen.
	it('shows the failure for whoever is testing the branch', () => {
		render(RenderFailure, { error: new TypeError('x.split is not a function') });
		expect(screen.getByText('x.split is not a function')).toBeTruthy();
	});

	it('describes a thrown value that is not an error at all', () => {
		render(RenderFailure, { error: 'something odd' });
		expect(screen.getByText('something odd')).toBeTruthy();
	});

	it('offers no retry when there is nothing to reset', () => {
		render(RenderFailure, { error: new Error('boom') });
		expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
	});

	it('re-renders the subtree when the retry is pressed', async () => {
		const reset = vi.fn();
		render(RenderFailure, { error: new Error('boom'), reset });

		await fireEvent.click(screen.getByRole('button', { name: /try again/i }));
		expect(reset).toHaveBeenCalledOnce();
	});
});
