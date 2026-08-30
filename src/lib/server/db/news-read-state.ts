import { supabase } from './client';
import { isUniqueViolation, storageFailed } from './errors';
import type { NewsMark } from '$lib/utils/news-unread';

/**
 * Where each reader has got to in the news feed.
 *
 * One row per user holding the newest item they have been shown. Trenara keeps
 * no read state, and per-item read rows would grow without bound for an answer
 * that is a single comparison — see `$lib/utils/news-unread`.
 */
export interface NewsReadStateRecord {
	user_id: number;
	last_seen_id: number;
	/** Unix seconds, matching `NewsItem.created_at`. */
	last_seen_created_at: number;
	updated_at: string;
}

export class NewsReadStateDAO {
	private static instance: NewsReadStateDAO;

	private constructor() {}

	static getInstance(): NewsReadStateDAO {
		if (!NewsReadStateDAO.instance) {
			NewsReadStateDAO.instance = new NewsReadStateDAO();
		}
		return NewsReadStateDAO.instance;
	}

	/**
	 * The reader's mark, or null if they have never been given one.
	 *
	 * Null is also what a database failure returns. That is deliberate: an
	 * unreadable mark must not turn into a badge counting the whole backlog, and
	 * "no badge" is the safe way to be wrong.
	 */
	async getMark(userId: number): Promise<NewsMark | null> {
		const { data, error } = await supabase
			.from('news_read_state')
			.select('last_seen_id, last_seen_created_at')
			.eq('user_id', userId)
			.maybeSingle();

		if (error) {
			console.error('Failed to read news mark:', error.message);
			return null;
		}
		if (!data) return null;

		const row = data as Pick<NewsReadStateRecord, 'last_seen_id' | 'last_seen_created_at'>;
		return { id: row.last_seen_id, createdAt: row.last_seen_created_at };
	}

	/**
	 * Move the reader's mark forward to `mark`.
	 *
	 * Monotonic, and enforced by the statement rather than by a read followed
	 * by a write: the old shape compared in JavaScript and then upserted, with
	 * nothing stopping two concurrent marks from interleaving so that the older
	 * one landed last.
	 *
	 * The ordering is the one `isNewer` describes — `created_at` first, because
	 * that is what the feed itself is ordered by, with the id breaking ties
	 * inside the same second — expressed here as the `WHERE` clause of a single
	 * update.
	 *
	 * `advanced: false` means the stored mark was already at least this far
	 * along, and only that. A write that failed is reported as a failure.
	 */
	async advanceMark(userId: number, mark: NewsMark): Promise<{ advanced: boolean }> {
		const { data, error } = await supabase
			.from('news_read_state')
			.update({
				last_seen_id: mark.id,
				last_seen_created_at: mark.createdAt,
				updated_at: new Date().toISOString()
			})
			.eq('user_id', userId)
			.or(
				`last_seen_created_at.lt.${mark.createdAt},` +
					`and(last_seen_created_at.eq.${mark.createdAt},last_seen_id.lt.${mark.id})`
			)
			.select('user_id');

		if (error) storageFailed('news mark write', error);
		if ((data ?? []).length > 0) return { advanced: true };

		// Nothing moved: either no row yet, or the stored mark is already newer.
		// The insert tells them apart, and a unique violation is the second case.
		const { error: insertError } = await supabase.from('news_read_state').insert({
			user_id: userId,
			last_seen_id: mark.id,
			last_seen_created_at: mark.createdAt,
			updated_at: new Date().toISOString()
		});

		if (!insertError) return { advanced: true };
		if (isUniqueViolation(insertError)) return { advanced: false };

		storageFailed('news mark write', insertError);
	}
}

export const newsReadStateDAO = NewsReadStateDAO.getInstance();
