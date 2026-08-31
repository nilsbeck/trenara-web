import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import EnduranceChart from './endurance-chart.svelte';

/** The width every position in these tests is worked out against. */
const WIDTH = 500;
const HEIGHT = 220;
const PAD_LEFT = 54;
const PAD_RIGHT = 16;

// jsdom lays nothing out, so a chart measured at zero puts every point at the
// same x and no pointer test can tell them apart.
beforeAll(() => {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;

	Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
		configurable: true,
		get: () => WIDTH
	});
});

/** A runner whose endurance came to them over a marathon block. */
const readings = [
	{ date: '2026-01-05', exponent: 1.08 },
	{ date: '2026-03-02', exponent: 1.06 },
	{ date: '2026-05-04', exponent: 1.04 }
];

/** A 40:00 10K, so the marathon arithmetic is easy to hold in the head. */
const TEN_K = 2400;

function mount(props: Record<string, unknown> = {}) {
	return render(EnduranceChart, {
		props: { data: readings, referenceTenKSeconds: TEN_K, ...props }
	});
}

async function moveTo(container: HTMLElement, fraction: number) {
	const svg = container.querySelector('svg[role="img"]') as SVGSVGElement;
	svg.getBoundingClientRect = () =>
		({ left: 0, top: 0, width: WIDTH, height: HEIGHT }) as unknown as DOMRect;

	const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
	const surface = container.querySelector('rect[fill="transparent"]') as SVGRectElement;
	surface.dispatchEvent(
		new MouseEvent('mousemove', {
			bubbles: true,
			clientX: PAD_LEFT + plotWidth * fraction,
			clientY: 100
		})
	);
	await tick();
}

describe('endurance chart', () => {
	afterEach(cleanup);

	it('prices the axis in marathons rather than in exponents', () => {
		// 1.06 is a number nobody has intuition for; "4.60x your 10K" is the same
		// fact and can be read.
		const { container } = mount();

		expect(container.textContent).toContain('4.73x');
		expect(container.textContent).toContain('4.47x');
	});

	it('says what the change in shape is worth at the current 10K', () => {
		// The whole reason this chart is separate from the 10K one. Nothing about
		// their speed moved here — only the shape — and it is ten minutes.
		const { container } = mount();

		expect(container.textContent).toContain('11 min');
		expect(container.textContent).toContain('of marathon gained');
	});

	it('reads out one day, in both the multiple and the marathon it implies', async () => {
		const { container } = mount();
		await moveTo(container, 0);

		expect(container.textContent).toContain('4.73x your 10K');
		// 4.7307 x a 40:00 10K is a 3:09:23 marathon.
		expect(container.textContent).toContain('3:09:23');
		expect(container.textContent).toContain('1.0800');
	});

	it('drops the marathon line when there is no 10K to price it against', async () => {
		const { container } = mount({ referenceTenKSeconds: null });
		await moveTo(container, 0);

		expect(container.textContent).toContain('4.73x your 10K');
		expect(container.textContent).not.toContain("At today's 10K");
	});

	it('does not call a flat series a gain', () => {
		const { container } = mount({
			data: [
				{ date: '2026-01-05', exponent: 1.06 },
				{ date: '2026-03-02', exponent: 1.06 }
			]
		});

		expect(container.textContent).toContain('Endurance shape steady');
		expect(container.textContent).not.toContain('gained');
	});

	it('draws a single reading without claiming a trend', () => {
		const { container } = mount({ data: [readings[0]] });

		expect(container.querySelectorAll('circle')).toHaveLength(1);
		expect(container.textContent).toContain('Endurance shape steady');
	});

	it('says what is missing rather than drawing an empty plot', () => {
		// "Nothing to report" and "not measurable yet" are different answers, and
		// an empty frame reads as the first.
		const { container } = mount({ data: [] });

		expect(container.textContent).toContain('No endurance readings yet');
		// The icon beside the message is an svg of its own; the plot is not drawn.
		expect(container.querySelector('svg[role="img"]')).toBeNull();
	});
});
