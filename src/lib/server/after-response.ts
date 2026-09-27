import { waitUntil } from '@vercel/functions';

/**
 * Let `task` finish after the response has gone out, without the response
 * waiting for it.
 *
 * A promise simply left running is not enough on a serverless platform: the
 * function can be frozen the moment it has answered, so "fire and forget"
 * means "sometimes forget". `waitUntil` tells Vercel to keep the invocation
 * alive until the task settles. Outside Vercel — tests, `vite preview` — there
 * is no request context and it does nothing, which is correct there: the
 * process stays up and the task runs to completion on its own.
 *
 * Only for work nothing on the page reads. The task must handle its own
 * failures; one that rejects is logged here rather than left unhandled.
 */
export function afterResponse(task: Promise<unknown>): void {
	waitUntil(
		task.catch((error: unknown) => {
			console.error('[afterResponse] background task failed:', error);
		})
	);
}
