import { userApi } from '$lib/server/api';
import { TokenType } from '$lib/server/auth';
import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { getSessionTokenCookie } from '$lib/server/auth';

export const load: LayoutServerLoad = async ({ cookies}) => {
    if (!getSessionTokenCookie(cookies, TokenType.AccessToken)) {
		return redirect(302, '/login');
	}

    const userData = userApi.getCurrentUser(cookies);
    return {
        "userData": userData
    };
};
