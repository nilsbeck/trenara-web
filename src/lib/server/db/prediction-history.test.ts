import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseError } from './errors';
import { PredictionValidator, PredictionHistoryDAO } from './prediction-history';
import { secondsToTimeString } from '$lib/utils/format';
import { RIEGEL_EXPONENT } from '$lib/utils/race-equivalent';

// ── Mock the supabase client ──────────────────────────────────
// vi.hoisted lets us reference these variables inside vi.mock (which is hoisted)
const { mockSingle, mockChain, mockFrom } = vi.hoisted(() => {
	const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null });

	const mockChain: Record<string, unknown> = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis(),
		gte: vi.fn().mockReturnThis(),
		lte: vi.fn().mockReturnThis(),
		lt: vi.fn().mockReturnThis(),
		upsert: vi.fn().mockReturnThis(),
		update: vi.fn().mockReturnThis(),
		is: vi.fn().mockReturnThis(),
		not: vi.fn().mockReturnThis(),
		delete: vi.fn().mockReturnThis(),
		single: mockSingle
	};

	// Make the chain awaitable for queries that don't call .single()
	(mockChain as Record<string, unknown>)['then'] = vi.fn(
		(resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
			Promise.resolve({ data: [], error: null }).then(resolve, reject)
	);

	const mockFrom = vi.fn().mockReturnValue(mockChain);
	return { mockSingle, mockChain, mockFrom };
});

vi.mock('$lib/server/db/client', () => ({
	supabase: { from: mockFrom }
}));

// ─────────────────────────────────────────────────────────────
// PredictionValidator
// ─────────────────────────────────────────────────────────────
describe('PredictionValidator', () => {
	describe('validateTime', () => {
		it('accepts HH:MM:SS format', () => {
			expect(PredictionValidator.validateTime('1:30:00')).toBe(true);
		});

		it('accepts H:MM:SS with single-digit hour', () => {
			expect(PredictionValidator.validateTime('3:05:45')).toBe(true);
		});

		it('accepts MM:SS (without hours)', () => {
			expect(PredictionValidator.validateTime('45:30')).toBe(true);
		});

		it('rejects plain seconds only', () => {
			expect(PredictionValidator.validateTime('90')).toBe(false);
		});

		it('rejects letters', () => {
			expect(PredictionValidator.validateTime('abc')).toBe(false);
		});

		it('rejects empty string', () => {
			expect(PredictionValidator.validateTime('')).toBe(false);
		});

		it('rejects extra colons (4 parts)', () => {
			expect(PredictionValidator.validateTime('1:30:00:00')).toBe(false);
		});

		it('rejects non-padded seconds like 1:5:0', () => {
			expect(PredictionValidator.validateTime('1:5:0')).toBe(false);
		});
	});

	describe('validatePace', () => {
		it('accepts MM:SS format', () => {
			expect(PredictionValidator.validatePace('5:30')).toBe(true);
		});

		it('accepts single-digit minutes', () => {
			expect(PredictionValidator.validatePace('4:05')).toBe(true);
		});

		it('rejects HH:MM:SS (too many parts)', () => {
			expect(PredictionValidator.validatePace('5:30:00')).toBe(false);
		});

		it('rejects pace with text suffix', () => {
			expect(PredictionValidator.validatePace('5:30 min/km')).toBe(false);
		});

		it('rejects empty string', () => {
			expect(PredictionValidator.validatePace('')).toBe(false);
		});

		it('rejects single number without colon', () => {
			expect(PredictionValidator.validatePace('330')).toBe(false);
		});

		it('rejects non-padded seconds like 5:5', () => {
			expect(PredictionValidator.validatePace('5:5')).toBe(false);
		});
	});

	describe('validateUserId', () => {
		it('accepts positive integers', () => {
			expect(PredictionValidator.validateUserId(1)).toBe(true);
			expect(PredictionValidator.validateUserId(9999)).toBe(true);
		});

		it('rejects zero', () => {
			expect(PredictionValidator.validateUserId(0)).toBe(false);
		});

		it('rejects negative integers', () => {
			expect(PredictionValidator.validateUserId(-1)).toBe(false);
		});

		it('rejects floats', () => {
			expect(PredictionValidator.validateUserId(1.5)).toBe(false);
		});
	});

	describe('validateDate', () => {
		it('accepts ISO date string', () => {
			expect(PredictionValidator.validateDate('2025-03-05')).toBe(true);
		});

		it('accepts ISO datetime string', () => {
			expect(PredictionValidator.validateDate('2025-03-05T12:00:00.000Z')).toBe(true);
		});

		it('rejects arbitrary text', () => {
			expect(PredictionValidator.validateDate('not-a-date')).toBe(false);
		});

		it('rejects empty string', () => {
			expect(PredictionValidator.validateDate('')).toBe(false);
		});
	});
});

// ─────────────────────────────────────────────────────────────
// PredictionHistoryDAO — storeIfChanged
// ─────────────────────────────────────────────────────────────
describe('PredictionHistoryDAO.storeIfChanged', () => {
	let dao: PredictionHistoryDAO;

	beforeEach(() => {
		dao = PredictionHistoryDAO.getInstance();
		vi.clearAllMocks();
		// Restore default chain return values after clearAllMocks
		for (const method of [
			'select',
			'eq',
			'order',
			'limit',
			'gte',
			'lte',
			'lt',
			'upsert',
			'delete'
		]) {
			(mockChain[method] as ReturnType<typeof vi.fn>).mockReturnValue(mockChain);
		}
		mockFrom.mockReturnValue(mockChain);
	});

	it('returns stored=false for invalid time', async () => {
		const result = await dao.storeIfChanged(1, 'bad-time', '5:30');
		expect(result.stored).toBe(false);
		expect(mockFrom).not.toHaveBeenCalled();
	});

	it('returns stored=false for invalid pace', async () => {
		const result = await dao.storeIfChanged(1, '1:30:00', 'bad-pace');
		expect(result.stored).toBe(false);
		expect(mockFrom).not.toHaveBeenCalled();
	});

	it('returns stored=false when prediction is unchanged', async () => {
		// getLatestPrediction returns the same time/pace
		mockSingle.mockResolvedValueOnce({
			data: {
				id: 1,
				user_id: 1,
				predicted_time: '1:30:00',
				predicted_pace: '5:30',
				recorded_at: '2025-03-04',
				created_at: '2025-03-04T00:00:00Z'
			},
			error: null
		});

		const result = await dao.storeIfChanged(1, '1:30:00', '5:30');
		expect(result.stored).toBe(false);
	});

	it('returns stored=true when prediction is new (no previous record)', async () => {
		// getLatestPrediction returns null (first call uses .single())
		mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
		// upsert .single() returns the new record
		const newRecord = {
			id: 2,
			user_id: 1,
			predicted_time: '1:28:00',
			predicted_pace: '5:15',
			recorded_at: '2025-03-05',
			created_at: '2025-03-05T00:00:00Z'
		};
		mockSingle.mockResolvedValueOnce({ data: newRecord, error: null });

		const result = await dao.storeIfChanged(1, '1:28:00', '5:15');
		expect(result.stored).toBe(true);
		expect(result.record).toMatchObject({ predicted_time: '1:28:00', predicted_pace: '5:15' });
	});

	it('stores the 10K reference alongside the goal prediction', async () => {
		mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
		mockSingle.mockResolvedValueOnce({ data: { id: 4 }, error: null });

		await dao.storeIfChanged(1, '1:28:00', '5:15', { time: '42:00', pace: '4:12' });

		const upsertArg = (mockChain.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(upsertArg).toMatchObject({
			predicted_time: '1:28:00',
			predicted_pace: '5:15',
			predicted_time_10k: '42:00',
			predicted_pace_10k: '4:12'
		});
	});

	it('omits the 10K columns entirely when no reference is given', async () => {
		mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
		mockSingle.mockResolvedValueOnce({ data: { id: 5 }, error: null });

		await dao.storeIfChanged(1, '1:28:00', '5:15');

		const upsertArg = (mockChain.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(upsertArg).not.toHaveProperty('predicted_time_10k');
		expect(upsertArg).not.toHaveProperty('predicted_pace_10k');
	});

	it('stores when only the 10K reference changed', async () => {
		mockSingle.mockResolvedValueOnce({
			data: {
				id: 1,
				user_id: 1,
				predicted_time: '1:30:00',
				predicted_pace: '5:30',
				predicted_time_10k: '43:00',
				predicted_pace_10k: '4:18',
				recorded_at: '2025-03-04',
				created_at: '2025-03-04T00:00:00Z'
			},
			error: null
		});
		mockSingle.mockResolvedValueOnce({ data: { id: 6 }, error: null });

		const result = await dao.storeIfChanged(1, '1:30:00', '5:30', {
			time: '42:30',
			pace: '4:15'
		});
		expect(result.stored).toBe(true);
	});

	it('stores when a 10K reference first becomes available on an older row', async () => {
		// Legacy row: goal prediction only, 10K columns still null.
		mockSingle.mockResolvedValueOnce({
			data: {
				id: 1,
				user_id: 1,
				predicted_time: '1:30:00',
				predicted_pace: '5:30',
				predicted_time_10k: null,
				predicted_pace_10k: null,
				recorded_at: '2025-03-04',
				created_at: '2025-03-04T00:00:00Z'
			},
			error: null
		});
		mockSingle.mockResolvedValueOnce({ data: { id: 7 }, error: null });

		const result = await dao.storeIfChanged(1, '1:30:00', '5:30', {
			time: '43:00',
			pace: '4:18'
		});
		expect(result.stored).toBe(true);
	});

	it('returns stored=false when both goal and 10K predictions are unchanged', async () => {
		mockSingle.mockResolvedValueOnce({
			data: {
				id: 1,
				user_id: 1,
				predicted_time: '1:30:00',
				predicted_pace: '5:30',
				predicted_time_10k: '43:00',
				predicted_pace_10k: '4:18',
				recorded_at: '2025-03-04',
				created_at: '2025-03-04T00:00:00Z'
			},
			error: null
		});

		const result = await dao.storeIfChanged(1, '1:30:00', '5:30', {
			time: '43:00',
			pace: '4:18'
		});
		expect(result.stored).toBe(false);
	});

	it('ignores a malformed 10K reference but still stores the goal prediction', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
		mockSingle.mockResolvedValueOnce({ data: { id: 8 }, error: null });

		const result = await dao.storeIfChanged(1, '1:28:00', '5:15', {
			time: '42:00',
			pace: 'not-a-pace'
		});

		expect(result.stored).toBe(true);
		const upsertArg = (mockChain.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(upsertArg).not.toHaveProperty('predicted_pace_10k');
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it('returns stored=true when prediction has changed', async () => {
		// getLatestPrediction returns an old record
		mockSingle.mockResolvedValueOnce({
			data: {
				id: 1,
				user_id: 1,
				predicted_time: '1:30:00',
				predicted_pace: '5:30',
				recorded_at: '2025-03-04',
				created_at: '2025-03-04T00:00:00Z'
			},
			error: null
		});
		// upsert returns updated record
		const updatedRecord = {
			id: 3,
			user_id: 1,
			predicted_time: '1:28:00',
			predicted_pace: '5:15',
			recorded_at: '2025-03-05',
			created_at: '2025-03-05T00:00:00Z'
		};
		mockSingle.mockResolvedValueOnce({ data: updatedRecord, error: null });

		const result = await dao.storeIfChanged(1, '1:28:00', '5:15');
		expect(result.stored).toBe(true);
	});
});

// ─────────────────────────────────────────────────────────────
// PredictionHistoryDAO — getUserPredictionHistory
// ─────────────────────────────────────────────────────────────
describe('PredictionHistoryDAO.getUserPredictionHistory', () => {
	let dao: PredictionHistoryDAO;

	const CHAIN_METHODS = [
		'select',
		'eq',
		'order',
		'limit',
		'gte',
		'lte',
		'lt',
		'upsert',
		'delete'
	] as const;

	function setThenResult(data: unknown, error: unknown = null) {
		(mockChain as Record<string, unknown>)['then'] = (
			resolve: (v: unknown) => void,
			reject?: (e: unknown) => void
		) => Promise.resolve({ data, error }).then(resolve, reject);
	}

	beforeEach(() => {
		dao = PredictionHistoryDAO.getInstance();
		vi.clearAllMocks();
		for (const method of CHAIN_METHODS) {
			(mockChain[method] as ReturnType<typeof vi.fn>).mockReturnValue(mockChain);
		}
		mockFrom.mockReturnValue(mockChain);
		setThenResult([]);
	});

	it('returns an empty array when no records exist', async () => {
		setThenResult([]);
		const records = await dao.getUserPredictionHistory(1);
		expect(records).toEqual([]);
	});

	it('returns records on success', async () => {
		const fakeRecords = [
			{
				id: 1,
				user_id: 1,
				predicted_time: '1:30:00',
				predicted_pace: '5:30',
				recorded_at: '2025-03-01',
				created_at: '2025-03-01T00:00:00Z'
			},
			{
				id: 2,
				user_id: 1,
				predicted_time: '1:28:00',
				predicted_pace: '5:20',
				recorded_at: '2025-03-05',
				created_at: '2025-03-05T00:00:00Z'
			}
		];
		setThenResult(fakeRecords);
		const records = await dao.getUserPredictionHistory(1);
		expect(records).toHaveLength(2);
		expect(records[0].predicted_time).toBe('1:30:00');
	});

	it('applies startDate filter (calls .gte on the chain)', async () => {
		setThenResult([]);
		await dao.getUserPredictionHistory(1, { startDate: '2025-03-01' });
		expect(mockChain.gte as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
			'recorded_at',
			'2025-03-01'
		);
	});

	it('applies endDate filter (calls .lte on the chain)', async () => {
		setThenResult([]);
		await dao.getUserPredictionHistory(1, { endDate: '2025-03-31' });
		expect(mockChain.lte as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
			'recorded_at',
			'2025-03-31'
		);
	});

	it('applies limit filter (calls .limit on the chain)', async () => {
		setThenResult([]);
		await dao.getUserPredictionHistory(1, { limit: 50 });
		expect(mockChain.limit as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(50);
	});

	// An unreadable table used to plot as a flat "no progress recorded", which
	// is a statement about the runner's training rather than about the database.
	it('raises rather than plotting a history it could not read', async () => {
		setThenResult(null, new Error('DB error'));
		await expect(dao.getUserPredictionHistory(1)).rejects.toBeInstanceOf(DatabaseError);
	});
});

// ─────────────────────────────────────────────────────────────
// PredictionHistoryDAO — storeIfChanged error path
// ─────────────────────────────────────────────────────────────
describe('PredictionHistoryDAO.storeIfChanged — upsert failure', () => {
	let dao: PredictionHistoryDAO;

	const CHAIN_METHODS = [
		'select',
		'eq',
		'order',
		'limit',
		'gte',
		'lte',
		'lt',
		'upsert',
		'delete'
	] as const;

	beforeEach(() => {
		dao = PredictionHistoryDAO.getInstance();
		vi.clearAllMocks();
		for (const method of CHAIN_METHODS) {
			(mockChain[method] as ReturnType<typeof vi.fn>).mockReturnValue(mockChain);
		}
		mockFrom.mockReturnValue(mockChain);
		mockSingle.mockResolvedValue({ data: null, error: null });
	});

	// `stored: false` still means "there was nothing to store" — a malformed
	// reading, or one identical to today's. A write that was attempted and
	// failed is a different answer, and sharing one flag hid it.
	it('raises rather than looking like there was nothing to store', async () => {
		// getLatestPrediction → null (no existing record)
		mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
		// upsert → error
		mockSingle.mockResolvedValueOnce({ data: null, error: new Error('Constraint violation') });

		await expect(dao.storeIfChanged(1, '1:28:00', '5:15')).rejects.toBeInstanceOf(DatabaseError);
	});
});

// ─────────────────────────────────────────────────────────────
// PredictionHistoryDAO — null-data defensive branches
// ─────────────────────────────────────────────────────────────
describe('PredictionHistoryDAO — null-data defensive branches', () => {
	let dao: PredictionHistoryDAO;

	const CHAIN_METHODS = [
		'select',
		'eq',
		'order',
		'limit',
		'gte',
		'lte',
		'lt',
		'upsert',
		'delete'
	] as const;

	beforeEach(() => {
		dao = PredictionHistoryDAO.getInstance();
		vi.clearAllMocks();
		for (const method of CHAIN_METHODS) {
			(mockChain[method] as ReturnType<typeof vi.fn>).mockReturnValue(mockChain);
		}
		mockFrom.mockReturnValue(mockChain);
	});

	it('getUserPredictionHistory returns [] when data is null and no error', async () => {
		// Supabase returns {data: null, error: null} — triggers the `data ?? []` branch
		(mockChain as Record<string, unknown>)['then'] = (
			resolve: (v: unknown) => void,
			reject?: (e: unknown) => void
		) => Promise.resolve({ data: null, error: null }).then(resolve, reject);

		const records = await dao.getUserPredictionHistory(1);
		expect(records).toEqual([]);
	});
});

// ─────────────────────────────────────────────────────────────
// backfillDerivedTenK
// ─────────────────────────────────────────────────────────────
describe('backfillDerivedTenK', () => {
	const dao = PredictionHistoryDAO.getInstance();

	beforeEach(() => {
		vi.clearAllMocks();
		mockFrom.mockReturnValue(mockChain);
	});

	/** Make every awaited query resolve with these rows. */
	function rowsFound(rows: unknown[]) {
		queriesResolve(rows);
	}

	/**
	 * Answer successive awaited queries with successive sets of rows.
	 *
	 * The back-fill makes two: the rows to convert, then the recorded sets it
	 * fits this user's exponent from. They are different shapes, and one canned
	 * answer for both would have the fit reading the rows being converted.
	 * The last set answers anything further.
	 */
	function queriesResolve(...answers: unknown[][]) {
		let call = 0;
		(mockChain as Record<string, unknown>)['then'] = vi.fn((resolve: (v: unknown) => void) => {
			const rows = answers[Math.min(call, answers.length - 1)];
			call++;
			return Promise.resolve({ data: rows, error: null }).then(resolve);
		});
	}

	it('only looks at rows that have neither a recorded nor a derived value', async () => {
		rowsFound([]);
		await dao.backfillDerivedTenK(1);

		// Both nulls, or the back-fill would overwrite what the API recorded.
		expect(mockChain.is).toHaveBeenCalledWith('predicted_time_10k', null);
		expect(mockChain.is).toHaveBeenCalledWith('derived_time_10k', null);
	});

	it('writes the equivalent into the derived columns', async () => {
		queriesResolve([{ id: 7, predicted_time: '01:03:12', predicted_pace: '04:12' }], []);

		const filled = await dao.backfillDerivedTenK(1);

		expect(filled).toBe(1);
		// A 15km prediction of 1:03:12 is the 40:56 the API gives for 10km.
		expect(mockChain.update).toHaveBeenCalledWith({
			derived_time_10k: '0:40:56',
			derived_pace_10k: '4:06'
		});
	});

	it("converts on the user's own exponent, not the captured one", async () => {
		// One row to convert, and the recorded sets that say who this runner is:
		// they hold pace, at 1.02 rather than the 1.071 taken from one account.
		// On a three-hour goal prediction that difference is minutes, and it is
		// minutes in the runner's own history.
		const theirs = (km: number) => secondsToTimeString(Math.round(1169 * Math.pow(km / 5, 1.02)));
		queriesResolve(
			[{ id: 9, predicted_time: '03:00:12', predicted_pace: '04:23' }],
			[
				{
					predicted_time_5k: theirs(5),
					predicted_time_10k: theirs(10),
					predicted_time_half: theirs(21.0975),
					predicted_time_marathon: theirs(42.195)
				}
			]
		);

		await dao.backfillDerivedTenK(1);

		// 41 km at 3:00:12 is 42:44 on their curve, against the 39:45 the captured
		// exponent would have written into their history — three minutes of a
		// runner they are not, on every converted row.
		expect(mockChain.update).toHaveBeenCalledWith({
			derived_time_10k: '0:42:44',
			derived_pace_10k: '4:16'
		});
	});

	it('falls back to the captured exponent for a user with no recorded set', async () => {
		// Everyone was converted on this number until their own rows could say
		// otherwise, so it is the right thing to keep doing where they cannot.
		queriesResolve([{ id: 7, predicted_time: '01:03:12', predicted_pace: '04:12' }], []);

		await dao.backfillDerivedTenK(1);

		expect(mockChain.update).toHaveBeenCalledWith({
			derived_time_10k: '0:40:56',
			derived_pace_10k: '4:06'
		});
	});

	it('fits the exponent only once there is something to convert', async () => {
		// A caught-up user loads this page every day and has nothing to gain from
		// a fit, so the steady-state cost stays the one empty query it was.
		rowsFound([]);

		await dao.backfillDerivedTenK(1);

		expect(mockChain.not).not.toHaveBeenCalled();
	});

	it('leaves a row it cannot convert alone', async () => {
		rowsFound([{ id: 8, predicted_time: '01:03:12', predicted_pace: '00:00' }]);

		expect(await dao.backfillDerivedTenK(1)).toBe(0);
		expect(mockChain.update).not.toHaveBeenCalled();
	});

	it('has nothing to do once it has caught up', async () => {
		rowsFound([]);
		expect(await dao.backfillDerivedTenK(1)).toBe(0);
		expect(mockChain.update).not.toHaveBeenCalled();
	});
});

// ─────────────────────────────────────────────────────────────
// riegelExponent
// ─────────────────────────────────────────────────────────────
describe('riegelExponent', () => {
	const dao = PredictionHistoryDAO.getInstance();

	beforeEach(() => {
		vi.clearAllMocks();
		mockFrom.mockReturnValue(mockChain);
	});

	/** Make the next awaited query resolve with these rows. */
	function rowsFound(rows: unknown[]) {
		(mockChain as Record<string, unknown>)['then'] = vi.fn((resolve: (v: unknown) => void) =>
			Promise.resolve({ data: rows, error: null }).then(resolve)
		);
	}

	/** A day's recorded set for a runner whose times rise at `exponent`. */
	function setFor(exponent: number, fitness = 1169) {
		const at = (km: number) =>
			secondsToTimeString(Math.round(fitness * Math.pow(km / 5, exponent)));
		return {
			predicted_time_5k: at(5),
			predicted_time_10k: at(10),
			predicted_time_half: at(21.0975),
			predicted_time_marathon: at(42.195)
		};
	}

	it("reads the exponent out of the user's own recorded sets", async () => {
		rowsFound([setFor(1.04)]);
		expect(await dao.riegelExponent(1)).toBeCloseTo(1.04, 3);
	});

	it('gives two runners two different exponents', async () => {
		// The point of the whole exercise: this is a fact about the runner, and
		// one number cannot be right for both of them.
		rowsFound([setFor(1.02)]);
		const holdsPace = await dao.riegelExponent(1);

		rowsFound([setFor(1.11)]);
		const fades = await dao.riegelExponent(2);

		expect(holdsPace).toBeLessThan(fades);
		expect(fades - holdsPace).toBeCloseTo(0.09, 2);
	});

	it('is not moved by the one day the API returned something strange', async () => {
		// A median rather than a mean, so an outlier does not drag every converted
		// row in a user's history along with it.
		rowsFound([
			setFor(1.05),
			setFor(1.05),
			{ ...setFor(1.05), predicted_time_marathon: '9:59:59' }
		]);

		expect(await dao.riegelExponent(1)).toBeCloseTo(1.05, 3);
	});

	it('reads across days rather than trusting the newest one', async () => {
		// Each row is fitted on its own — a set is one day at one fitness level,
		// and pooling days would put several levels through a single line.
		rowsFound([setFor(1.06, 1100), setFor(1.04, 1169), setFor(1.02, 1250)]);

		expect(await dao.riegelExponent(1)).toBeCloseTo(1.04, 3);
	});

	it('ignores a row too partial to imply a slope', async () => {
		rowsFound([{ predicted_time_10k: '00:40:56' }, setFor(1.03)]);

		expect(await dao.riegelExponent(1)).toBeCloseTo(1.03, 3);
	});

	it('only fits rows whose set was actually recorded', async () => {
		rowsFound([]);
		await dao.riegelExponent(1);

		expect(mockChain.not).toHaveBeenCalledWith('predicted_time_10k', 'is', null);
	});

	it('falls back to the captured exponent when the user has no set yet', async () => {
		rowsFound([]);
		expect(await dao.riegelExponent(1)).toBe(RIEGEL_EXPONENT);
	});

	it('falls back rather than failing when the query does', async () => {
		(mockChain as Record<string, unknown>)['then'] = vi.fn((resolve: (v: unknown) => void) =>
			Promise.resolve({ data: null, error: { message: 'boom' } }).then(resolve)
		);

		expect(await dao.riegelExponent(1)).toBe(RIEGEL_EXPONENT);
	});
});

// ─────────────────────────────────────────────────────────────
// storeIfChanged — the recorded prediction set
// ─────────────────────────────────────────────────────────────
describe('storeIfChanged with the wider prediction set', () => {
	const dao = PredictionHistoryDAO.getInstance();

	beforeEach(() => {
		vi.clearAllMocks();
		mockFrom.mockReturnValue(mockChain);
	});

	/** What the last upsert was asked to write. */
	function written() {
		return (mockChain.upsert as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as Record<
			string,
			unknown
		>;
	}

	/** The row `getLatestPrediction` finds, then the row the upsert returns. */
	function latestIs(row: unknown) {
		mockSingle.mockResolvedValueOnce({ data: row, error: null });
		mockSingle.mockResolvedValueOnce({ data: { id: 1 }, error: null });
	}

	it('records the other distances the same response predicted', async () => {
		latestIs(null);

		await dao.storeIfChanged(1, '56:00', '3:44', null, {
			time5k: '00:19:29',
			timeHalf: '01:31:04',
			timeMarathon: '03:11:18'
		});

		expect(written()).toMatchObject({
			predicted_time_5k: '00:19:29',
			predicted_time_half: '01:31:04',
			predicted_time_marathon: '03:11:18'
		});
	});

	it('still records a client that only knows the goal prediction', async () => {
		latestIs(null);

		const result = await dao.storeIfChanged(1, '56:00', '3:44');

		expect(result.stored).toBe(true);
		// Omitted rather than nulled, so an older client cannot erase what a newer
		// one recorded.
		expect(written()).not.toHaveProperty('predicted_time_5k');
		expect(written()).not.toHaveProperty('predicted_time_10k');
	});

	it('counts a distance arriving for the first time as a change', async () => {
		// The goal prediction has not moved, but the set is the point: skipping
		// the write would leave it unrecorded until the prediction happened to
		// change on its own.
		latestIs({
			predicted_time: '56:00',
			predicted_pace: '3:44',
			predicted_time_10k: null,
			predicted_pace_10k: null,
			predicted_time_5k: null
		});

		const result = await dao.storeIfChanged(1, '56:00', '3:44', null, { time5k: '00:19:29' });

		expect(result.stored).toBe(true);
	});

	it('skips the write when nothing at all has moved', async () => {
		latestIs({
			predicted_time: '56:00',
			predicted_pace: '3:44',
			predicted_time_10k: null,
			predicted_pace_10k: null,
			predicted_time_5k: '00:19:29'
		});

		const result = await dao.storeIfChanged(1, '56:00', '3:44', null, { time5k: '00:19:29' });

		expect(result.stored).toBe(false);
		expect(mockChain.upsert).not.toHaveBeenCalled();
	});

	it('drops a malformed distance rather than failing the row', async () => {
		latestIs(null);

		await dao.storeIfChanged(1, '56:00', '3:44', null, { time5k: 'not a time' });

		expect(written()).not.toHaveProperty('predicted_time_5k');
		expect(written()).toMatchObject({ predicted_time: '56:00' });
	});
});
