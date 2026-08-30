import { supabase } from './client';
import { isUniqueViolation, storageFailed } from './errors';

/**
 * How far each reader has got in each chat thread.
 *
 * Trenara reports `unread_messages` per thread but never clears it for
 * messages read through this app, so the count alone re-badges conversations
 * that were finished days ago. One row per user and thread holds the newest
 * message this app has shown them; `$lib/components/chat/unread` turns that
 * into "is there anything new?" with a single comparison.
 */
export interface ChatReadStateRecord {
	user_id: number;
	thread_id: number;
	last_seen_message_id: number;
	updated_at: string;
}

export class ChatReadStateDAO {
	private static instance: ChatReadStateDAO;

	private constructor() {}

	static getInstance(): ChatReadStateDAO {
		if (!ChatReadStateDAO.instance) {
			ChatReadStateDAO.instance = new ChatReadStateDAO();
		}
		return ChatReadStateDAO.instance;
	}

	/**
	 * Every mark the reader has, keyed by thread id.
	 *
	 * A database failure reads as an empty set of marks. Unlike the news badge,
	 * the count itself still comes from Trenara, so the worst that costs is a
	 * badge for a conversation already read — where suppressing it instead would
	 * hide a coach's reply, which is the one thing the badge exists to show.
	 */
	async getMarks(userId: number): Promise<Map<number, number>> {
		const { data, error } = await supabase
			.from('chat_read_state')
			.select('thread_id, last_seen_message_id')
			.eq('user_id', userId);

		if (error) {
			console.error('Failed to read chat marks:', error.message);
			return new Map();
		}

		const rows = (data ?? []) as Pick<ChatReadStateRecord, 'thread_id' | 'last_seen_message_id'>[];
		return new Map(rows.map((row) => [row.thread_id, row.last_seen_message_id]));
	}

	/**
	 * Move a thread's mark forward.
	 *
	 * Monotonic, and now actually so. This used to read the current mark,
	 * compare it in JavaScript and then upsert — three steps with no lock
	 * between them, so two marks arriving together (the reply poll and a page
	 * load, which is a routine pairing) could interleave and let the lower id
	 * win. The comparison happens inside the statement now: an `UPDATE … WHERE
	 * last_seen_message_id < $new` either moves the row or does nothing, and
	 * Postgres serialises the two writers itself.
	 *
	 * `advanced: false` means the mark was already at least this far along, and
	 * only that — a failed write is reported as a failure.
	 */
	async advanceMark(
		userId: number,
		threadId: number,
		lastSeenMessageId: number
	): Promise<{ advanced: boolean }> {
		const { data, error } = await supabase
			.from('chat_read_state')
			.update({
				last_seen_message_id: lastSeenMessageId,
				updated_at: new Date().toISOString()
			})
			.eq('user_id', userId)
			.eq('thread_id', threadId)
			.lt('last_seen_message_id', lastSeenMessageId)
			.select('thread_id');

		if (error) storageFailed('chat mark write', error);
		if ((data ?? []).length > 0) return { advanced: true };

		// Nothing moved: either there is no row yet, or the stored mark is
		// already at or past this one. Insert to tell the two apart — a unique
		// violation is the second case, which is a no-op rather than a failure.
		const { error: insertError } = await supabase.from('chat_read_state').insert({
			user_id: userId,
			thread_id: threadId,
			last_seen_message_id: lastSeenMessageId,
			updated_at: new Date().toISOString()
		});

		if (!insertError) return { advanced: true };
		if (isUniqueViolation(insertError)) return { advanced: false };

		storageFailed('chat mark write', insertError);
	}
}

export const chatReadStateDAO = ChatReadStateDAO.getInstance();
