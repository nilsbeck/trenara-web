import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { TokenType } from '$lib/server/auth/types';
import { AuthenticationError, HttpError } from './client';
import { trainingApi } from './training';
import { userApi } from './user';
import { chatApi } from './chat';
import { newsApi } from './news';

// ─────────────────────────────────────────────────────────────
// These cover the request each api method actually puts on the
// wire — path, method and body. For a reverse-engineered API
// that's the part worth pinning down: a wrong field name fails
// silently against the real server.
// ─────────────────────────────────────────────────────────────

const ACCESS_TOKEN = 'test-access-token';

function makeCookies(): Cookies {
	return {
		get: (name: string) => (name === TokenType.AccessToken ? ACCESS_TOKEN : undefined)
	} as unknown as Cookies;
}

function mockResponse(body: unknown, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		statusText: 'OK',
		headers: new Headers({ 'content-type': 'application/json' }),
		json: () => Promise.resolve(body),
		text: () => Promise.resolve(JSON.stringify(body))
	} as unknown as Response;
}

type FetchMock = ReturnType<typeof vi.fn>;

function fetchMock(): FetchMock {
	return globalThis.fetch as unknown as FetchMock;
}

/** URL, method and parsed JSON body of the most recent fetch call. */
function lastRequest() {
	const call = fetchMock().mock.calls.at(-1);
	if (!call) throw new Error('fetch was never called');
	const [url, init] = call as [string, RequestInit];
	return {
		url: String(url),
		method: init?.method,
		headers: (init?.headers ?? {}) as Record<string, string>,
		body: init?.body ? JSON.parse(String(init.body)) : undefined
	};
}

let cookies: Cookies;

beforeEach(() => {
	vi.stubGlobal('fetch', vi.fn());
	cookies = makeCookies();
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────
describe('newsApi.getNews', () => {
	it('requests page 1 by default', async () => {
		fetchMock().mockResolvedValue(mockResponse({ data: [], pagination: {} }));
		await newsApi.getNews(cookies);

		const req = lastRequest();
		expect(req.url).toBe('https://backend-prod.trenara.com/api/news/?page=1');
		expect(req.method).toBe('GET');
		expect(req.headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
	});

	it('passes an explicit page through', async () => {
		fetchMock().mockResolvedValue(mockResponse({ data: [], pagination: {} }));
		await newsApi.getNews(cookies, 3);
		expect(lastRequest().url).toContain('page=3');
	});

	it('returns the parsed envelope', async () => {
		const payload = {
			data: [
				{ id: 82, title: 'News', content: 'c', video_url: null, created_at: 1, attachment: null }
			],
			pagination: { total: 1, count: 1, per_page: 10, current_page: 1, total_pages: 1, links: {} }
		};
		fetchMock().mockResolvedValue(mockResponse(payload));

		const result = await newsApi.getNews(cookies);
		expect(result.data[0].id).toBe(82);
		expect(result.pagination.total).toBe(1);
	});

	it('surfaces a 401 as AuthenticationError', async () => {
		fetchMock().mockResolvedValue(mockResponse({}, 401));
		await expect(newsApi.getNews(cookies)).rejects.toBeInstanceOf(AuthenticationError);
	});
});

// ─────────────────────────────────────────────────────────────
describe('userApi.getShoes', () => {
	it('GETs the shoe locker', async () => {
		fetchMock().mockResolvedValue(mockResponse([]));
		await userApi.getShoes(cookies);

		const req = lastRequest();
		expect(req.url).toBe('https://backend-prod.trenara.com/api/me/shoes');
		expect(req.method).toBe('GET');
	});

	it('returns a bare array, not an envelope', async () => {
		fetchMock().mockResolvedValue(mockResponse([{ id: 6404, brand: 'Adidas', name: 'Boston 13' }]));
		const shoes = await userApi.getShoes(cookies);
		expect(Array.isArray(shoes)).toBe(true);
		expect(shoes[0].id).toBe(6404);
	});

	it('surfaces a server error as HttpError', async () => {
		fetchMock().mockResolvedValue(mockResponse({ message: 'boom' }, 500));
		await expect(userApi.getShoes(cookies)).rejects.toBeInstanceOf(HttpError);
	});
});

// ─────────────────────────────────────────────────────────────
describe('chatApi.sendMessage', () => {
	// Trenara names this field `body`, matching the messages it returns.
	// Sending `content` instead is silently wrong, so pin it down.
	it('sends the text as `body`', async () => {
		fetchMock().mockResolvedValue(mockResponse({ id: 1 }));
		await chatApi.sendMessage(cookies, 1482, 'what pace for the tempo run?');

		const req = lastRequest();
		expect(req.url).toBe('https://backend-prod.trenara.com/api/threads/1482/messages');
		expect(req.method).toBe('POST');
		expect(req.body).toEqual({ body: 'what pace for the tempo run?' });
		expect(req.body).not.toHaveProperty('content');
	});
});

// ─────────────────────────────────────────────────────────────
describe('trainingApi.getTraining', () => {
	it('GETs one scheduled training', async () => {
		fetchMock().mockResolvedValue(mockResponse({ id: 127477827 }));
		await trainingApi.getTraining(cookies, 127477827);

		const req = lastRequest();
		expect(req.url).toBe('https://backend-prod.trenara.com/api/schedule/trainings/127477827');
		expect(req.method).toBe('GET');
	});
});

describe('trainingApi.setIntensity', () => {
	it('PUTs the step value as `intensity_value`', async () => {
		fetchMock().mockResolvedValue(mockResponse({ id: 127477827 }));
		await trainingApi.setIntensity(cookies, 127477827, -2);

		const req = lastRequest();
		expect(req.url).toBe(
			'https://backend-prod.trenara.com/api/schedule/trainings/127477827/intensity'
		);
		expect(req.method).toBe('PUT');
		expect(req.body).toEqual({ intensity_value: -2 });
	});
});

describe('trainingApi.setDistance', () => {
	it('PUTs the percentage delta as `distance_value`', async () => {
		fetchMock().mockResolvedValue(mockResponse({ id: 127477827 }));
		await trainingApi.setDistance(cookies, 127477827, -10);

		const req = lastRequest();
		expect(req.url).toBe(
			'https://backend-prod.trenara.com/api/schedule/trainings/127477827/distance'
		);
		expect(req.method).toBe('PUT');
		expect(req.body).toEqual({ distance_value: -10 });
	});
});

describe('trainingApi.setSuggestedShoe', () => {
	it('PUTs the shoe id as `shoe_id`', async () => {
		fetchMock().mockResolvedValue(mockResponse({ id: 127477827 }));
		await trainingApi.setSuggestedShoe(cookies, 127477827, 6404);

		const req = lastRequest();
		expect(req.url).toBe(
			'https://backend-prod.trenara.com/api/schedule/trainings/127477827/suggested_shoe'
		);
		expect(req.method).toBe('PUT');
		expect(req.body).toEqual({ shoe_id: 6404 });
	});
});

describe('trainingApi.crossTrain', () => {
	it('PUTs the activity as `cross_type`', async () => {
		fetchMock().mockResolvedValue(mockResponse({ id: 127477833 }));
		await trainingApi.crossTrain(cookies, 127477833, 'road_bike');

		const req = lastRequest();
		expect(req.url).toBe(
			'https://backend-prod.trenara.com/api/schedule/trainings/127477833/cross_train'
		);
		expect(req.method).toBe('PUT');
		expect(req.body).toEqual({ cross_type: 'road_bike' });
	});

	it('sends a null cross type rather than omitting the field', async () => {
		// Reverting to a run lives in the same picker as the activities, so it
		// goes through this endpoint — and the field has to be there to say so.
		fetchMock().mockResolvedValue(mockResponse({ id: 1 }));
		await trainingApi.crossTrain(cookies, 1, null);

		const req = lastRequest();
		expect(req.method).toBe('PUT');
		expect(req.body).toEqual({ cross_type: null });
		expect('cross_type' in req.body).toBe(true);
	});
});

describe('trainingApi.setTrainingCondition', () => {
	it('maps the condition onto the API field names', async () => {
		fetchMock().mockResolvedValue(mockResponse({ id: 127477827 }));
		await trainingApi.setTrainingCondition(cookies, 127477827, {
			surface: 'treadmill',
			heightDifference: 'flat'
		});

		const req = lastRequest();
		expect(req.url).toBe(
			'https://backend-prod.trenara.com/api/schedule/trainings/127477827/training_condition'
		);
		expect(req.method).toBe('POST');
		expect(req.body).toEqual({
			height_difference: 'flat',
			surface: 'treadmill',
			height_value: 0,
			height_unit: 'm'
		});
	});

	it('passes an explicit height through', async () => {
		fetchMock().mockResolvedValue(mockResponse({ id: 1 }));
		await trainingApi.setTrainingCondition(cookies, 1, {
			surface: 'road',
			heightDifference: 'mountain',
			heightValue: 450,
			heightUnit: 'm'
		});

		expect(lastRequest().body).toEqual({
			height_difference: 'mountain',
			surface: 'road',
			height_value: 450,
			height_unit: 'm'
		});
	});

	it('sends all four fields even when the caller names only two', async () => {
		// This endpoint does not merge a partial body: a field left out is
		// answered "The … field is required" rather than kept at its stored
		// value, so a caller setting only the terrain still carries the height.
		fetchMock().mockResolvedValue(mockResponse({ id: 1 }));
		await trainingApi.setTrainingCondition(cookies, 1, {
			surface: 'single_track',
			heightDifference: 'strong'
		});

		expect(Object.keys(lastRequest().body).sort()).toEqual([
			'height_difference',
			'height_unit',
			'height_value',
			'surface'
		]);
	});

	it('sends both enums as the labels the read side returns', async () => {
		// They travel as "flat" and "treadmill", not as indices — an
		// unrecognised value is refused with "The selected height difference is
		// invalid", which is why the editor stages a known label.
		fetchMock().mockResolvedValue(mockResponse({ id: 1 }));
		await trainingApi.setTrainingCondition(cookies, 1, {
			surface: 'treadmill',
			heightDifference: 'lights'
		});

		const body = lastRequest().body;
		expect(body.height_difference).toBe('lights');
		expect(body.surface).toBe('treadmill');
	});
});

describe('trainingApi exchange', () => {
	it('lists candidates for a training', async () => {
		fetchMock().mockResolvedValue(mockResponse([]));
		await trainingApi.getExchangeOptions(cookies, 127477827);

		const req = lastRequest();
		expect(req.url).toBe(
			'https://backend-prod.trenara.com/api/schedule/trainings/127477827/exchange'
		);
		expect(req.method).toBe('GET');
	});

	// The path takes the scheduled training id and the body takes the
	// candidate id. They come from different id spaces and swapping them
	// is the easy mistake to make here.
	it('puts the scheduled id in the path and the candidate id in the body', async () => {
		fetchMock().mockResolvedValue(mockResponse({ id: 127477833 }));
		await trainingApi.exchangeTraining(cookies, 127477833, 20113);

		const req = lastRequest();
		expect(req.url).toBe(
			'https://backend-prod.trenara.com/api/schedule/trainings/127477833/exchange'
		);
		expect(req.method).toBe('PUT');
		expect(req.body).toEqual({ training_id: 20113 });
	});
});

describe('training mutations', () => {
	it('all send the bearer token', async () => {
		fetchMock().mockResolvedValue(mockResponse({ id: 1 }));

		await trainingApi.setIntensity(cookies, 1, 0);
		expect(lastRequest().headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);

		await trainingApi.crossTrain(cookies, 1, 'road_bike');
		expect(lastRequest().headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
	});

	it('surface a 401 as AuthenticationError', async () => {
		fetchMock().mockResolvedValue(mockResponse({}, 401));
		await expect(trainingApi.getTraining(cookies, 1)).rejects.toBeInstanceOf(AuthenticationError);
	});
});
