import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { HttpError, NetworkError } from '#lib/server/trenara/client.js';
import { loginByIp, loginByUsername } from '#lib/server/security/rate-limit.js';
import { actions } from './+page.server';

const mockLogin = vi.fn();
vi.mock('#lib/server/trenara/auth.js', () => ({
	authApi: { login: (...args: unknown[]) => mockLogin(...args) }
}));

const USERNAME = 'runner@example.com';
const PASSWORD = 'correct horse battery staple';
const IP = '203.0.113.7';

function cookies(): Cookies {
	return { get: vi.fn(), set: vi.fn(), delete: vi.fn() } as unknown as Cookies;
}

function event(fields: Record<string, string> = { username: USERNAME, password: PASSWORD }) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	return {
		request: new Request('https://app.test/login?/login', { method: 'POST', body }),
		cookies: cookies(),
		getClientAddress: () => IP
	} as unknown as Parameters<typeof actions.login>[0];
}

/** Everything written to the log during the case, as one string. */
function logged(spy: ReturnType<typeof vi.spyOn>): string {
	return spy.mock.calls.map((args: unknown[]) => args.map(String).join(' ')).join('\n');
}

describe('login action — security logging', () => {
	let warn: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		mockLogin.mockReset();
		loginByIp.reset();
		loginByUsername.reset();
		warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		warn.mockRestore();
	});

	it('logs a refused sign-in with the source IP and the upstream status', async () => {
		mockLogin.mockRejectedValue(new HttpError('Unauthorized', 401, { error: 'invalid_grant' }));

		const result = await actions.login(event());

		expect(result).toMatchObject({ status: 401 });
		expect(warn).toHaveBeenCalledTimes(1);
		expect(logged(warn)).toContain(IP);
		expect(logged(warn)).toContain('401');
	});

	it('logs a sign-in that failed to reach Trenara as such, not as a status', async () => {
		mockLogin.mockRejectedValue(new NetworkError('fetch failed'));

		await actions.login(event());

		expect(logged(warn)).toContain('NetworkError');
	});

	it('logs a sign-in refused by the per-IP limit', async () => {
		mockLogin.mockRejectedValue(new HttpError('Unauthorized', 401));
		for (let i = 0; i < 10; i++) {
			loginByIp.check(IP);
		}

		const result = await actions.login(event());

		expect(result).toMatchObject({ status: 429 });
		expect(mockLogin).not.toHaveBeenCalled();
		expect(logged(warn)).toContain(IP);
		expect(logged(warn)).toMatch(/rate.limit/i);
		expect(logged(warn)).toMatch(/\bip\b/i);
	});

	it('logs a sign-in refused by the per-account limit without naming the account', async () => {
		for (let i = 0; i < 5; i++) {
			loginByUsername.check(USERNAME);
		}

		const result = await actions.login(event());

		expect(result).toMatchObject({ status: 429 });
		expect(logged(warn)).toMatch(/account/i);
	});

	it('never writes the username or the password to the log', async () => {
		mockLogin.mockRejectedValue(new HttpError('Unauthorized', 401, { username: USERNAME }));
		await actions.login(event());
		for (let i = 0; i < 6; i++) loginByUsername.check(USERNAME);
		await actions.login(event());

		expect(warn).toHaveBeenCalled();
		expect(logged(warn)).not.toContain(USERNAME);
		expect(logged(warn)).not.toContain('runner');
		expect(logged(warn)).not.toContain(PASSWORD);
	});

	it('logs nothing for a sign-in that succeeded', async () => {
		mockLogin.mockResolvedValue({
			access_token: 'a',
			refresh_token: 'r',
			expires_in: 3600,
			token_type: 'Bearer'
		});

		await expect(actions.login(event())).rejects.toMatchObject({ status: 302 });
		expect(warn).not.toHaveBeenCalled();
	});

	it('logs nothing for a form the schema refused, which never reached Trenara', async () => {
		const result = await actions.login(event({ username: 'not-an-email', password: PASSWORD }));

		expect(result).toMatchObject({ status: 400 });
		expect(warn).not.toHaveBeenCalled();
	});
});
