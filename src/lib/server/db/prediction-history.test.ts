import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PredictionValidator, PredictionHistoryDAO } from './prediction-history';

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
		for (const method of ['select', 'eq', 'order', 'limit', 'gte', 'lte', 'lt', 'upsert', 'delete']) {
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

	const CHAIN_METHODS = ['select', 'eq', 'order', 'limit', 'gte', 'lte', 'lt', 'upsert', 'delete'] as const;

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
			{ id: 1, user_id: 1, predicted_time: '1:30:00', predicted_pace: '5:30', recorded_at: '2025-03-01', created_at: '2025-03-01T00:00:00Z' },
			{ id: 2, user_id: 1, predicted_time: '1:28:00', predicted_pace: '5:20', recorded_at: '2025-03-05', created_at: '2025-03-05T00:00:00Z' }
		];
		setThenResult(fakeRecords);
		const records = await dao.getUserPredictionHistory(1);
		expect(records).toHaveLength(2);
		expect(records[0].predicted_time).toBe('1:30:00');
	});

	it('applies startDate filter (calls .gte on the chain)', async () => {
		setThenResult([]);
		await dao.getUserPredictionHistory(1, { startDate: '2025-03-01' });
		expect((mockChain.gte as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('recorded_at', '2025-03-01');
	});

	it('applies endDate filter (calls .lte on the chain)', async () => {
		setThenResult([]);
		await dao.getUserPredictionHistory(1, { endDate: '2025-03-31' });
		expect((mockChain.lte as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('recorded_at', '2025-03-31');
	});

	it('applies limit filter (calls .limit on the chain)', async () => {
		setThenResult([]);
		await dao.getUserPredictionHistory(1, { limit: 50 });
		expect((mockChain.limit as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(50);
	});

	it('returns empty array on supabase error', async () => {
		setThenResult(null, new Error('DB error'));
		const records = await dao.getUserPredictionHistory(1);
		expect(records).toEqual([]);
	});
});

// ─────────────────────────────────────────────────────────────
// PredictionHistoryDAO — storeIfChanged error path
// ─────────────────────────────────────────────────────────────
describe('PredictionHistoryDAO.storeIfChanged — upsert failure', () => {
	let dao: PredictionHistoryDAO;

	const CHAIN_METHODS = ['select', 'eq', 'order', 'limit', 'gte', 'lte', 'lt', 'upsert', 'delete'] as const;

	beforeEach(() => {
		dao = PredictionHistoryDAO.getInstance();
		vi.clearAllMocks();
		for (const method of CHAIN_METHODS) {
			(mockChain[method] as ReturnType<typeof vi.fn>).mockReturnValue(mockChain);
		}
		mockFrom.mockReturnValue(mockChain);
		mockSingle.mockResolvedValue({ data: null, error: null });
	});

	it('returns stored=false when upsert fails', async () => {
		// getLatestPrediction → null (no existing record)
		mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
		// upsert → error
		mockSingle.mockResolvedValueOnce({ data: null, error: new Error('Constraint violation') });

		const result = await dao.storeIfChanged(1, '1:28:00', '5:15');
		expect(result.stored).toBe(false);
		expect(result.record).toBeUndefined();
	});
});

// ─────────────────────────────────────────────────────────────
// PredictionHistoryDAO — null-data defensive branches
// ─────────────────────────────────────────────────────────────
describe('PredictionHistoryDAO — null-data defensive branches', () => {
	let dao: PredictionHistoryDAO;

	const CHAIN_METHODS = ['select', 'eq', 'order', 'limit', 'gte', 'lte', 'lt', 'upsert', 'delete'] as const;

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
