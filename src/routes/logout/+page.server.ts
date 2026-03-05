import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { TokenManager } from '$lib/server/auth/token-manager';

export const load: PageServerLoad = async ({ cookies }) => {
	const tokenManager = TokenManager.getInstance();
	await tokenManager.logout(cookies);
	redirect(302, '/login');
};
