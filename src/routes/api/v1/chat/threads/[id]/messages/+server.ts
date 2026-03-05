import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chatApi } from '$lib/server/trenara';
import { TokenType } from '$lib/server/auth/types';

export const GET: RequestHandler = async ({ params, url, cookies }) => {
	if (!cookies.get(TokenType.AccessToken)) {
		error(401, 'Unauthorized');
	}

	const threadId = Number(params.id);
	if (isNaN(threadId)) {
		error(400, 'Invalid thread ID');
	}

	const page = Number(url.searchParams.get('page') ?? '1');
	const timestamp = url.searchParams.get('timestamp');

	const data = await chatApi.getMessages(
		cookies,
		threadId,
		page,
		timestamp ? Number(timestamp) : undefined
	);
	return json(data);
};

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	if (!cookies.get(TokenType.AccessToken)) {
		error(401, 'Unauthorized');
	}

	const threadId = Number(params.id);
	if (isNaN(threadId)) {
		error(400, 'Invalid thread ID');
	}

	const body = await request.json();
	const content = body?.content;

	if (typeof content !== 'string' || !content.trim()) {
		error(400, 'Missing or empty message content');
	}

	const data = await chatApi.sendMessage(cookies, threadId, content);
	return json(data);
};
