import type { PageServerLoad } from './$types';
import { newsApi } from '$lib/server/trenara';
import { passthrough } from '$lib/server/trenara/request';
import { newsReadStateDAO } from '$lib/server/db/news-read-state';
import { requireUser } from '$lib/server/auth/guard';

export const load: PageServerLoad = async ({ cookies, locals }) => {
	const user = requireUser(locals);

	// The mark comes along unchanged and is deliberately not advanced here: the
	// feed marks itself read from the browser, once it has rendered. A page that
	// failed on the way to the reader has not been read.
	const [news, mark] = await Promise.all([
		passthrough(() => newsApi.getNews(cookies, 1)),
		newsReadStateDAO.getMark(user.id)
	]);

	return { news, mark };
};
