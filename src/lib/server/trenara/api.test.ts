import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { TokenType } from '$lib/server/auth/types';
import { AuthenticationError, HttpError } from './client';
import { trainingApi } from './training';
import { userApi } from './user';
import { chatApi } from './chat';
import { newsApi } from './news';
import { resetReadCache } from './read-cache';

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
	// Reads are cached per user and the map outlives a single case.
	resetReadCache();
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
describe('userApi.updateProfile', () => {
	const profile = {
		email: 'user@example.com',
		first_name: 'Nils',
		last_name: 'Beckmann',
		date_of_birth: '1985-07-29',
		nationality_id: 276,
		gender: 'm',
		uses_imperial: false,
		weight: 73,
		weight_unit: 'kg',
		height: 188,
		height_unit: 'cm'
	};

	it('PUTs the profile to /api/me', async () => {
		fetchMock().mockResolvedValue(mockResponse({ id: 56540 }));
		await userApi.updateProfile(cookies, profile);

		const req = lastRequest();
		expect(req.url).toBe('https://backend-prod.trenara.com/api/me');
		expect(req.method).toBe('PUT');
		expect(req.body).toEqual(profile);
	});

	// The thresholds ride along flat, not nested under a `pace_lts` object —
	// and `*_unit` travels with each value, so sending the number alone is
	// silently wrong.
	it('sends the lactate thresholds as flat value/unit pairs', async () => {
		fetchMock().mockResolvedValue(mockResponse({ id: 56540 }));
		await userApi.updateProfile(cookies, {
			...profile,
			hr_prior: false,
			pace_lt1_value: 291,
			pace_lt1_unit: 'sec_km',
			pace_lt2_value: 244,
			pace_lt2_unit: 'sec_km'
		});

		const req = lastRequest();
		expect(req.body).toMatchObject({
			hr_prior: false,
			pace_lt1_value: 291,
			pace_lt1_unit: 'sec_km',
			pace_lt2_value: 244,
			pace_lt2_unit: 'sec_km'
		});
	});

	it('returns the whole account, not just what was written', async () => {
		fetchMock().mockResolvedValue(mockResponse({ id: 56540, weight: 73, has_premium: true }));

		const user = await userApi.updateProfile(cookies, profile);
		expect(user.id).toBe(56540);
		expect(user.has_premium).toBe(true);
	});

	it('surfaces a 401 as AuthenticationError', async () => {
		fetchMock().mockResolvedValue(mockResponse({}, 401));
		await expect(userApi.updateProfile(cookies, profile)).rejects.toBeInstanceOf(
			AuthenticationError
		);
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

// ─────────────────────────────────────────────────────────────
// Staying inside Trenara's 60-a-minute budget
//
// `/api/schedule/week/` was half of everything this app sent — there is no
// month endpoint, so a month costs five or six of these and paging between
// two months bought the same weeks again every time.
// ─────────────────────────────────────────────────────────────
describe('the week cache', () => {
	beforeEach(() => {
		resetReadCache();
	});

	it('asks for a week once, however many times a month is loaded', async () => {
		fetchMock().mockResolvedValue(mockResponse({ trainings: [] }));

		await trainingApi.getSchedule(cookies, 1000);
		await trainingApi.getSchedule(cookies, 1000);
		await trainingApi.getSchedule(cookies, 1000);

		expect(fetchMock()).toHaveBeenCalledTimes(1);
	});

	// A month is five or six distinct weeks; only the repeats are saved.
	it('still fetches each distinct week of a month', async () => {
		fetchMock().mockResolvedValue(mockResponse({ trainings: [] }));

		await Promise.all(
			[1000, 2000, 3000, 4000, 5000].map((ts) => trainingApi.getSchedule(cookies, ts))
		);

		expect(fetchMock()).toHaveBeenCalledTimes(5);
	});

	// Two page loads racing was the doubling in the report.
	it('collapses two simultaneous loads of the same month into one set of requests', async () => {
		fetchMock().mockResolvedValue(mockResponse({ trainings: [] }));
		const month = [1000, 2000, 3000, 4000, 5000, 6000];

		await Promise.all([
			Promise.all(month.map((ts) => trainingApi.getSchedule(cookies, ts))),
			Promise.all(month.map((ts) => trainingApi.getSchedule(cookies, ts)))
		]);

		expect(fetchMock()).toHaveBeenCalledTimes(6);
	});

	it('goes back to Trenara when the caller asks for fresh', async () => {
		fetchMock().mockResolvedValue(mockResponse({ trainings: [] }));

		await trainingApi.getSchedule(cookies, 1000);
		await trainingApi.getSchedule(cookies, 1000, { fresh: true });

		expect(fetchMock()).toHaveBeenCalledTimes(2);
	});

	// The failure mode a cache introduces: a runner changes something and the
	// calendar goes on showing the plan from before.
	it('is dropped by a write, so a changed plan is never served from before it', async () => {
		fetchMock().mockResolvedValue(mockResponse({ id: 1 }));

		await trainingApi.getSchedule(cookies, 1000);
		await trainingApi.setIntensity(cookies, 127477827, -2);
		await trainingApi.getSchedule(cookies, 1000);

		// week, the write, then the week again.
		expect(fetchMock()).toHaveBeenCalledTimes(3);
	});

	it('is dropped by a delete and by a move as well', async () => {
		fetchMock().mockResolvedValue(mockResponse({ id: 1 }));

		await trainingApi.getSchedule(cookies, 1000);
		await trainingApi.deleteScheduledTraining(cookies, 1);
		await trainingApi.getSchedule(cookies, 1000);
		await trainingApi.saveChangeDate(cookies, 1, '2026-09-01T00:00:00.000Z', false);
		await trainingApi.getSchedule(cookies, 1000);

		expect(fetchMock()).toHaveBeenCalledTimes(5);
	});

	// A dry run changes nothing upstream, so it must not throw the cache away.
	it('is left alone by the change-date dry run', async () => {
		fetchMock().mockResolvedValue(mockResponse({ goal_possible: true }));

		await trainingApi.getSchedule(cookies, 1000);
		await trainingApi.testChangeDate(cookies, 1, '2026-09-01T00:00:00.000Z', false);
		await trainingApi.getSchedule(cookies, 1000);

		// The week, then the dry run. The second week came from memory.
		expect(fetchMock()).toHaveBeenCalledTimes(2);
	});
});

describe('the goal and stats caches', () => {
	beforeEach(() => {
		resetReadCache();
	});

	// Both are read by the dashboard and again by the goal page — four of each
	// in the minute that tripped the limit, and the last two uncached reads.
	it('asks for the goal and the stats once across both pages', async () => {
		fetchMock().mockResolvedValue(mockResponse({ id: 1 }));

		await Promise.all([trainingApi.getGoal(cookies), userApi.getUserStats(cookies)]);
		await Promise.all([trainingApi.getGoal(cookies), userApi.getUserStats(cookies)]);

		expect(fetchMock()).toHaveBeenCalledTimes(2);
	});

	// An intensity change rescales the session *and* moves the predictions in
	// `/api/me/stats`, so a write drops everything rather than guessing.
	it('drops the stats after a training write, not just the week', async () => {
		fetchMock().mockResolvedValue(mockResponse({ id: 1 }));

		await userApi.getUserStats(cookies);
		await trainingApi.setIntensity(cookies, 127477827, -2);
		await userApi.getUserStats(cookies);

		expect(fetchMock()).toHaveBeenCalledTimes(3);
	});

	it('drops the goal after a training write too', async () => {
		fetchMock().mockResolvedValue(mockResponse({ id: 1 }));

		await trainingApi.getGoal(cookies);
		await trainingApi.deleteScheduledTraining(cookies, 1);
		await trainingApi.getGoal(cookies);

		expect(fetchMock()).toHaveBeenCalledTimes(3);
	});
});

describe('the account cache', () => {
	beforeEach(() => {
		resetReadCache();
	});

	// The layout asks on every navigation; it ran five times a minute against a
	// budget of sixty for the whole app.
	it('asks for the account once per navigation burst', async () => {
		fetchMock().mockResolvedValue(mockResponse({ id: 56540 }));

		await userApi.getCurrentUser(cookies);
		await userApi.getCurrentUser(cookies);

		expect(fetchMock()).toHaveBeenCalledTimes(1);
	});

	it('is dropped when the profile is edited', async () => {
		fetchMock().mockResolvedValue(mockResponse({ id: 56540 }));

		await userApi.getCurrentUser(cookies);
		await userApi.updateProfile(cookies, { first_name: 'Nils' } as never);
		await userApi.getCurrentUser(cookies);

		expect(fetchMock()).toHaveBeenCalledTimes(3);
	});
});
