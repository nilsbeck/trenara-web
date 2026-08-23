import { supabase } from './client';
import type { NewsMark } from '$lib/utils/news-unread';
import { isNewer } from '$lib/utils/news-unread';

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
	 * Monotonic: an older mark is ignored rather than written, so a tab left
	 * open on last week's feed cannot un-read what has arrived since.
	 */
	async advanceMark(userId: number, mark: NewsMark): Promise<{ advanced: boolean }> {
		const current = await this.getMark(userId);
		if (current !== null && !isNewer(mark, current)) {
			return { advanced: false };
		}

		const { error } = await supabase.from('news_read_state').upsert(
			{
				user_id: userId,
				last_seen_id: mark.id,
				last_seen_created_at: mark.createdAt,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'user_id' }
		);

		if (error) {
			console.error('Failed to store news mark:', error.message);
			return { advanced: false };
		}

		return { advanced: true };
	}
}

export const newsReadStateDAO = NewsReadStateDAO.getInstance();
