import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
	console.warn('Supabase credentials not configured. Database features will be unavailable.');
}

export const supabase = createClient(
	SUPABASE_URL ?? '',
	SUPABASE_SERVICE_ROLE_KEY ?? '',
	{
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	}
);
