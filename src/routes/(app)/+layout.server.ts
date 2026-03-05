import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { TokenType } from '$lib/server/auth/types';
import { userApi } from '$lib/server/trenara';

export const load: LayoutServerLoad = async ({ cookies }) => {
	if (!cookies.get(TokenType.AccessToken)) {
		redirect(302, '/login');
	}

	const userData = userApi.getCurrentUser(cookies);

	return {
		userData
	};
};
