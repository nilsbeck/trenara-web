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
// backfillRiegelCurve
// ─────────────────────────────────────────────────────────────
describe('backfillRiegelCurve', () => {
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
	 * The back-fill makes two: the rows with no curve yet, then the dated
	 * exponents a row that cannot fit its own borrows from. They are different
	 * shapes, and one canned answer for both would have a row borrowing from
	 * itself. The last set answers anything further, the row updates included.
	 */
	function queriesResolve(...answers: unknown[][]) {
		let call = 0;
		(mockChain as Record<string, unknown>)['then'] = vi.fn((resolve: (v: unknown) => void) => {
			const rows = answers[Math.min(call, answers.length - 1)];
			call++;
			return Promise.resolve({ data: rows, error: null }).then(resolve);
		});
	}

	/** What each row update was asked to write. */
	function updates() {
		return (mockChain.update as ReturnType<typeof vi.fn>).mock.calls.map(
			(call) => call[0] as Record<string, unknown>
		);
	}

	/** A row with nothing but its goal prediction — all the older rows have. */
	function goalOnly(id: number, recorded_at: string) {
		return {
			id,
			recorded_at,
			predicted_time: '01:03:12',
			predicted_pace: '04:12',
			predicted_time_10k: null,
			predicted_time_5k: null,
			predicted_time_half: null,
			predicted_time_marathon: null
		};
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

	it('only looks at rows that have no curve yet', async () => {
		rowsFound([]);
		await dao.backfillRiegelCurve(1);

		expect(mockChain.is).toHaveBeenCalledWith('riegel_exponent', null);
	});

	it("reads the curve out of a row's own recorded set", async () => {
		queriesResolve([
			{
				id: 3,
				recorded_at: '2025-06-01',
				predicted_time: '1:01:45',
				predicted_pace: '4:07',
				...setFor(1.05)
			}
		]);

		expect(await dao.backfillRiegelCurve(1)).toBe(1);

		// Both halves, from the one day: 1.05 is the shape of this runner, and
		// 215.7 seconds over a kilometre is where they were on the day.
		const [written] = updates();
		expect(written.riegel_exponent).toBeCloseTo(1.05, 3);
		expect(written.riegel_level).toBeCloseTo(215.7, 1);
		expect(written.riegel_source).toBe('fitted');
	});

	it('fits a row that has only its goal prediction and a recorded 10K', async () => {
		// Two distances is a slope, and most of the rows between the 10K column
		// arriving and the rest of the set arriving are exactly this shape. They
		// used to contribute nothing and take a borrowed exponent.
		queriesResolve([
			{
				id: 4,
				recorded_at: '2025-06-01',
				predicted_time: '01:03:12',
				predicted_pace: '04:12',
				predicted_time_10k: '00:40:56',
				predicted_time_5k: null,
				predicted_time_half: null,
				predicted_time_marathon: null
			}
		]);

		await dao.backfillRiegelCurve(1);

		const [written] = updates();
		expect(written.riegel_source).toBe('fitted');
		expect(written.riegel_exponent).toBeCloseTo(1.0713, 4);
		expect(written.riegel_level).toBeCloseTo(208.433, 2);
	});

	it('borrows from the nearest measured day, not the most recent one', async () => {
		// The exponent moves. A runner who held pace in 2020 and fades now is
		// better described, in 2020, by the day next to it than by who they have
		// since become — which is what a median over everything would have said.
		queriesResolve(
			[goalOnly(1, '2020-01-01')],
			[
				{ recorded_at: '2020-02-01', riegel_exponent: 1.02 },
				{ recorded_at: '2025-01-01', riegel_exponent: 1.12 }
			]
		);

		await dao.backfillRiegelCurve(1);

		const [written] = updates();
		expect(written.riegel_exponent).toBe(1.02);
		expect(written.riegel_source).toBe('borrowed');
		// 1:03:12 over 15 km, projected to one kilometre on that exponent.
		expect(written.riegel_level).toBeCloseTo(239.472, 2);
	});

	it('borrows from a day fitted in the same batch', async () => {
		// The spine a row borrows from is not only what is already stored: a first
		// run over a whole history has to fit and borrow in one pass.
		queriesResolve(
			[
				goalOnly(1, '2024-01-01'),
				{
					id: 2,
					recorded_at: '2024-01-08',
					predicted_time: '1:01:45',
					predicted_pace: '4:07',
					...setFor(1.02)
				}
			],
			[]
		);

		expect(await dao.backfillRiegelCurve(1)).toBe(2);

		const [borrowed, fitted] = updates();
		expect(fitted.riegel_source).toBe('fitted');
		expect(borrowed.riegel_source).toBe('borrowed');
		expect(borrowed.riegel_exponent).toBeCloseTo(1.02, 3);
	});

	it('falls back to the captured exponent when nothing can be fitted', async () => {
		// A user whose every row states one distance is converted on the number
		// everyone was converted on before, which is no worse than they had.
		queriesResolve([goalOnly(1, '2020-01-01')], []);

		await dao.backfillRiegelCurve(1);

		expect(updates()[0].riegel_exponent).toBe(RIEGEL_EXPONENT);
	});

	it("writes the 10K equivalent off the row's own curve", async () => {
		queriesResolve([goalOnly(1, '2020-01-01')], []);

		await dao.backfillRiegelCurve(1);

		// The row now carries what the conversion used, so `a * 10^e` reproduces
		// this exactly rather than depending on when the back-fill happened to run.
		expect(updates()[0]).toMatchObject({
			derived_time_10k: '0:40:56',
			derived_pace_10k: '4:06'
		});
	});

	it('never derives a 10K over one the API recorded', async () => {
		queriesResolve([
			{
				id: 5,
				recorded_at: '2025-06-01',
				predicted_time: '1:01:45',
				predicted_pace: '4:07',
				...setFor(1.05)
			}
		]);

		await dao.backfillRiegelCurve(1);

		const [written] = updates();
		expect(written).not.toHaveProperty('derived_time_10k');
		expect(written).not.toHaveProperty('derived_pace_10k');
	});

	it('does not go looking for exponents when every row fits its own', async () => {
		queriesResolve([
			{
				id: 6,
				recorded_at: '2025-06-01',
				predicted_time: '1:01:45',
				predicted_pace: '4:07',
				...setFor(1.05)
			}
		]);

		await dao.backfillRiegelCurve(1);

		expect(mockChain.eq).not.toHaveBeenCalledWith('riegel_source', 'fitted');
	});

	it('leaves a row it cannot read alone', async () => {
		queriesResolve([{ ...goalOnly(8, '2020-01-01'), predicted_pace: '00:00' }], []);

		expect(await dao.backfillRiegelCurve(1)).toBe(0);
		expect(mockChain.update).not.toHaveBeenCalled();
	});

	it('has nothing to do once it has caught up', async () => {
		rowsFound([]);

		expect(await dao.backfillRiegelCurve(1)).toBe(0);
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
			predicted_time_5k: '00:19:29',
			riegel_exponent: 1.05
		});

		const result = await dao.storeIfChanged(1, '56:00', '3:44', null, { time5k: '00:19:29' });

		expect(result.stored).toBe(false);
		expect(mockChain.upsert).not.toHaveBeenCalled();
	});

	it("stores the curve the day's predictions sit on", async () => {
		latestIs(null);

		await dao.storeIfChanged(
			1,
			'01:03:12',
			'04:12',
			{ time: '00:40:56', pace: '04:06' },
			{
				time5k: '00:19:29',
				timeHalf: '01:31:04',
				timeMarathon: '03:11:18'
			}
		);

		// Measured now, while the whole response is in hand, rather than left to
		// be filled in later from whoever the runner has become by then.
		expect(written().riegel_exponent).toBeCloseTo(RIEGEL_EXPONENT, 3);
		expect(written().riegel_level).toBeCloseTo(208.56, 1);
		expect(written().riegel_source).toBe('fitted');
	});

	it('leaves the curve off a write that states one distance', async () => {
		latestIs(null);

		await dao.storeIfChanged(1, '56:00', '3:44');

		// One point is a level and no slope. The back-fill borrows an exponent
		// from a neighbouring day and marks it as borrowed; a write cannot.
		expect(written()).not.toHaveProperty('riegel_exponent');
	});

	it('gives a row from before the curve existed one, without waiting for a change', async () => {
		latestIs({
			predicted_time: '01:03:12',
			predicted_pace: '04:12',
			predicted_time_10k: '00:40:56',
			predicted_pace_10k: '04:06',
			riegel_exponent: null
		});

		const result = await dao.storeIfChanged(
			1,
			'01:03:12',
			'04:12',
			{ time: '00:40:56', pace: '04:06' },
			null
		);

		expect(result.stored).toBe(true);
		expect(written().riegel_source).toBe('fitted');
	});

	it('derives the 10K when the response carried every distance but that one', async () => {
		latestIs(null);

		await dao.storeIfChanged(1, '1:01:45', '4:07', null, {
			time5k: '0:19:29',
			timeHalf: '1:28:21',
			timeMarathon: '3:02:55'
		});

		// Read off the curve just fitted, and marked derived rather than written
		// into the recorded columns.
		expect(written()).toMatchObject({ derived_time_10k: '0:40:21', derived_pace_10k: '4:02' });
		expect(written()).not.toHaveProperty('predicted_time_10k');
	});

	it('drops a malformed distance rather than failing the row', async () => {
		latestIs(null);

		await dao.storeIfChanged(1, '56:00', '3:44', null, { time5k: 'not a time' });

		expect(written()).not.toHaveProperty('predicted_time_5k');
		expect(written()).toMatchObject({ predicted_time: '56:00' });
	});
});
