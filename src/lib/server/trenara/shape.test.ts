import { describe, it, expect } from 'vitest';
import { MalformedResponseError } from './client';
import { expectArray, expectCollections, expectObject } from './shape';

describe('expectObject', () => {
	it('passes a real response through untouched', () => {
		const payload = { id: 56540, first_name: 'Nils' };
		expect(expectObject(payload, '/api/me')).toBe(payload);
	});

	// A bare `null` is what turns into `Cannot read properties of null` three
	// components deep, naming neither the endpoint nor the cause.
	it('refuses the shapes that crash a component', () => {
		for (const bad of [null, undefined, 'a string', 42, []]) {
			expect(() => expectObject(bad, '/api/me')).toThrow(MalformedResponseError);
		}
	});

	it('names the endpoint and what arrived, for whoever reads the log', () => {
		expect(() => expectObject(null, '/api/me')).toThrow(/\/api\/me/);
		expect(() => expectObject(null, '/api/me')).toThrow(/null/);
		expect(() => expectObject([], '/api/me')).toThrow(/an array/);
		expect(() => expectObject('nope', '/api/me')).toThrow(/string/);
	});
});

describe('expectArray', () => {
	it('passes a list through untouched', () => {
		const shoes = [{ id: 6404 }];
		expect(expectArray(shoes, '/api/me/shoes')).toBe(shoes);
	});

	it('is happy with an empty list, which is a real answer', () => {
		expect(expectArray([], '/api/me/shoes')).toEqual([]);
	});

	// `session-detail` maps straight over this the moment it lands.
	it('refuses anything that cannot be mapped over', () => {
		for (const bad of [null, undefined, {}, 'a string']) {
			expect(() => expectArray(bad, '/api/me/shoes')).toThrow(MalformedResponseError);
		}
	});
});

describe('expectCollections', () => {
	it('passes a week through untouched', () => {
		const week = { id: 1, trainings: [], strength_trainings: [], entries: [] };
		expect(expectCollections(week, '/api/schedule/week/', ['trainings'])).toBe(week);
	});

	// Every consumer already reads these as `?? []`, and a week with nothing in
	// it is a rest week rather than a fault.
	it('accepts a collection that is absent or null', () => {
		expect(() =>
			expectCollections({ id: 1 }, '/api/schedule/week/', ['trainings', 'entries'])
		).not.toThrow();
		expect(() =>
			expectCollections({ trainings: null }, '/api/schedule/week/', ['trainings'])
		).not.toThrow();
	});

	// What `for…of` does not survive.
	it('refuses a collection that arrived as something other than a list', () => {
		expect(() =>
			expectCollections({ trainings: 'none' }, '/api/schedule/week/', ['trainings'])
		).toThrow(MalformedResponseError);

		expect(() =>
			expectCollections({ trainings: { 0: 'a training' } }, '/api/schedule/week/', ['trainings'])
		).toThrow(MalformedResponseError);
	});

	it('says which collection was wrong, not just that one was', () => {
		expect(() =>
			expectCollections({ trainings: [], entries: 'nope' }, '/api/schedule/week/', [
				'trainings',
				'entries'
			])
		).toThrow(/entries/);
	});

	// The reason this is not a schema validator: a reverse-engineered API adds
	// fields without warning, and rejecting those would be a worse failure than
	// the one being prevented.
	it('ignores fields it was not asked about, including new ones', () => {
		const week = { trainings: [], somethingTrenaraAddedLastWeek: { nested: true } };
		expect(() => expectCollections(week, '/api/schedule/week/', ['trainings'])).not.toThrow();
	});
});
