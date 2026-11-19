import { waitFor } from '@testing-library/svelte';

/**
 * Wait for the goal card's graph to have arrived.
 *
 * The charts are a lazy chunk the card loads once it has mounted (see the
 * module script in `goal-card.svelte`), so a test about what the graph draws
 * waits for the placeholder to give way first. In the app that is a network
 * fetch; here it is a module import, which still settles after the render.
 */
export async function graphLoaded(): Promise<void> {
	await waitFor(() => {
		if (document.querySelector('[data-testid="goal-chart-loading"]')) {
			throw new Error('the goal card is still loading its graph');
		}
	});
}
