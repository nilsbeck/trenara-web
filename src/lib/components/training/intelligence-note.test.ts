import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import IntelligenceNote from '$lib/components/training/intelligence-note.svelte';

afterEach(cleanup);

describe('IntelligenceNote', () => {
	it('draws the heading and each paragraph separately', () => {
		render(IntelligenceNote, {
			paragraphs: ['I’ve adjusted your training.', 'You can still shorten it a little.']
		});
		expect(screen.getByRole('region', { name: 'Trenara Intelligence' })).toBeTruthy();
		const ps = screen.getByTestId('intelligence-note').querySelectorAll('p');
		expect([...ps].map((p) => p.textContent)).toEqual([
			'I’ve adjusted your training.',
			'You can still shorten it a little.'
		]);
	});
});
