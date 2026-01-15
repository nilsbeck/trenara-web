import { chatApi } from '$lib/server/api';
import { json, type RequestEvent } from '@sveltejs/kit';

export const GET = async (event: RequestEvent) => {
	try {
		const { id } = event.params;
		const threadId = parseInt(id);
		
		if (isNaN(threadId)) {
			return json({ error: 'Invalid thread ID' }, { status: 400 });
		}

		const page = parseInt(event.url.searchParams.get('page') || '1');
		const timestamp = event.url.searchParams.get('timestamp') 
			? parseInt(event.url.searchParams.get('timestamp')!) 
			: undefined;

		const messages = await chatApi.getMessages(event.cookies, threadId, page, timestamp);
		return json(messages);
	} catch (error) {
		console.error('Failed to get messages:', error);
		return json({ error: 'Failed to fetch messages' }, { status: 500 });
	}
};

export const POST = async (event: RequestEvent) => {
	try {
		const { id } = event.params;
		const threadId = parseInt(id);
		
		if (isNaN(threadId)) {
			return json({ error: 'Invalid thread ID' }, { status: 400 });
		}

		const { content } = await event.request.json();
		
		if (!content || typeof content !== 'string') {
			return json({ error: 'Message content is required' }, { status: 400 });
		}

		const message = await chatApi.sendMessage(event.cookies, threadId, content);
		return json(message);
	} catch (error) {
		return json({ error: 'Failed to send message' }, { status: 500 });
	}
};
