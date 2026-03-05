import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { userData } = await parent();
	return { userData };
};
