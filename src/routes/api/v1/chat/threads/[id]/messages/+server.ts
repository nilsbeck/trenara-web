import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chatApi } from '#lib/server/trenara/index.js';
import { passthrough, readBody } from '#lib/server/trenara/request.js';
import { sendMessageSchema } from '#lib/schemas/chat.js';

export const GET: RequestHandler = async ({ params, url, cookies }) => {
	const threadId = Number(params.id);
	if (!Number.isFinite(threadId) || threadId <= 0) {
		error(400, 'Invalid thread ID');
	}

	const rawPage = Number(url.searchParams.get('page') ?? '1');
	const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
	const rawTimestamp = url.searchParams.get('timestamp');
	const timestamp = rawTimestamp ? Number(rawTimestamp) : undefined;

	return Response.json(
		await passthrough(() =>
			chatApi.getMessages(
				cookies,
				threadId,
				page,
				timestamp && Number.isFinite(timestamp) ? timestamp : undefined
			)
		)
	);
};

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	const threadId = Number(params.id);
	if (!Number.isFinite(threadId) || threadId <= 0) {
		error(400, 'Invalid thread ID');
	}

	const { content } = await readBody(sendMessageSchema, request);

	return Response.json(await passthrough(() => chatApi.sendMessage(cookies, threadId, content)));
};
