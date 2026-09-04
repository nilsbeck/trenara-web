import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import PredictionChart from './prediction-chart.svelte';

/** The width every position in these tests is worked out against. */
const WIDTH = 500;

// jsdom lays nothing out: it has no ResizeObserver, and every element measures
// zero. Both are stubbed, because a chart measured at zero puts every point at
// the same x and no pointer test can tell them apart.
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

const readings = [
	{
		date: '2026-07-06',
		predictedTime: 12000,
		predictedPace: 284.4,
		formattedTime: '3:20:00',
		formattedPace: '4:44'
	},
	{
		date: '2026-07-20',
		predictedTime: 11800,
		predictedPace: 279.7,
		formattedTime: '3:16:40',
		formattedPace: '4:39'
	},
	{
		date: '2026-08-03',
		predictedTime: 11600,
		predictedPace: 275,
		formattedTime: '3:13:20',
		formattedPace: '4:35'
	}
];

const forecastSeries = {
	label: 'Forecast',
	colour: '#ec4899',
	points: [
		{ date: '2026-08-03', seconds: 11600, detail: [] },
		{ date: '2026-08-10', seconds: 11540, detail: ['62 km this week', '62 km since today'] },
		{ date: '2026-08-17', seconds: 11500, detail: ['38 km this week', '100 km since today'] },
		{ date: '2026-08-24', seconds: 11500, detail: ['Race day'] }
	]
};

const load = [
	{ from: new Date('2026-08-03'), to: new Date('2026-08-10'), km: 62 },
	{ from: new Date('2026-08-10'), to: new Date('2026-08-17'), km: 38 }
];

function mount(props: Record<string, unknown> = {}) {
	return render(PredictionChart, {
		props: { data: readings, domainEnd: new Date('2026-08-24'), ...props }
	});
}

/**
 * A mousemove at a fraction across the plot.
 *
 * The chart converts client coordinates into viewBox units against the SVG's
 * own bounding box, which jsdom reports as zero — so it is stubbed to the
 * viewBox width, which is what a browser reports when the two agree.
 */
async function moveTo(container: HTMLElement, fraction: number) {
	const svg = container.querySelector('svg[role="img"]') as SVGSVGElement;
	svg.getBoundingClientRect = () =>
		({ left: 0, top: 0, width: WIDTH, height: 260 }) as unknown as DOMRect;

	const PAD_LEFT = 54;
	const plotWidth = WIDTH - PAD_LEFT - 46;
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

describe('prediction chart', () => {
	afterEach(cleanup);

	it('gives every forecast vertex a dot of its own', () => {
		const { container } = mount({ projections: [forecastSeries] });
		const dots = container.querySelectorAll(`circle[fill="${forecastSeries.colour}"]`);
		expect(dots.length).toBe(forecastSeries.points.length);
	});

	it('draws the training still to come as bars under the plot', () => {
		const { container } = mount({ projections: [forecastSeries], load });
		// The bars are the only muted-filled rects in the plot.
		expect(container.querySelectorAll('rect.fill-muted-foreground').length).toBe(load.length);
		expect(container.textContent).toContain('bars: km to come');
	});

	it('says nothing about bars when there is no plan left to draw', () => {
		const { container } = mount({ projections: [forecastSeries] });
		expect(container.querySelectorAll('rect.fill-muted-foreground').length).toBe(0);
		expect(container.textContent).not.toContain('bars: km to come');
	});

	it('reads out the forecast when the pointer is past the last reading', async () => {
		const { container } = mount({ projections: [forecastSeries], load });
		await moveTo(container, 0.98);

		const text = container.textContent ?? '';
		expect(text).toContain('Forecast');
		expect(text).toContain('Race day');
	});

	it('shows the kilometres behind a mid-plan forecast point', async () => {
		const { container } = mount({ projections: [forecastSeries], load });
		// 2026-08-17 is 42 of the 49 days between the first reading and race day.
		await moveTo(container, 42 / 49);

		expect(container.textContent).toContain('38 km this week');
		expect(container.textContent).toContain('100 km since today');
	});

	it('still reads out the recorded series over the history', async () => {
		const { container } = mount({ projections: [forecastSeries], load });
		await moveTo(container, 0.28);

		expect(container.textContent).toContain('Time 3:16:40');
		expect(container.textContent).toContain('Pace 4:39');
	});

	it('drops y-axis labels that would overlap on a tightly clustered series', () => {
		// Two readings a few seconds apart, but a goal far below them stretches
		// the y extent — on the old value-only spacing check both labels stayed
		// and landed on top of each other.
		const clustered = [
			{
				date: '2026-08-27',
				predictedTime: 11048,
				predictedPace: 267.4,
				formattedTime: '3:04:08',
				formattedPace: '4:27'
			},
			{
				date: '2026-09-03',
				predictedTime: 11003,
				predictedPace: 266.3,
				formattedTime: '3:03:23',
				formattedPace: '4:26'
			}
		];
		const { container } = mount({
			data: clustered,
			domainEnd: new Date('2026-12-06'),
			reference: { seconds: 9475, label: 'Goal 02:37:55' }
		});

		const labelYs = Array.from(container.querySelectorAll('g > text'))
			.filter((el) => el.getAttribute('style')?.includes('font-size:10px'))
			.map((el) => Number(el.getAttribute('y')));

		const uniqueYs = [...new Set(labelYs)];
		for (let i = 0; i < uniqueYs.length; i++) {
			for (let j = i + 1; j < uniqueYs.length; j++) {
				expect(Math.abs(uniqueYs[i] - uniqueYs[j])).toBeGreaterThanOrEqual(14);
			}
		}
	});
});
