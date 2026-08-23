import { supabase } from './client';

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
	 * Monotonic: a lower id is ignored rather than written, so a tab left open
	 * on an older page of the conversation cannot un-read what arrived since.
	 */
	async advanceMark(
		userId: number,
		threadId: number,
		lastSeenMessageId: number
	): Promise<{ advanced: boolean }> {
		const marks = await this.getMarks(userId);
		const current = marks.get(threadId);
		if (current !== undefined && lastSeenMessageId <= current) {
			return { advanced: false };
		}

		const { error } = await supabase.from('chat_read_state').upsert(
			{
				user_id: userId,
				thread_id: threadId,
				last_seen_message_id: lastSeenMessageId,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'user_id,thread_id' }
		);

		if (error) {
			console.error('Failed to store chat mark:', error.message);
			return { advanced: false };
		}

		return { advanced: true };
	}
}

export const chatReadStateDAO = ChatReadStateDAO.getInstance();
