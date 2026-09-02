/**
 * A share link's token.
 *
 * 32 random bytes, base64url — 43 characters, 256 bits.
 *
 * From `crypto.getRandomValues`, which is the platform's CSPRNG on both the
 * Node runtime this deploys to and in tests. Not `Math.random`, which is
 * seeded predictably enough that guessing a live link becomes arithmetic.
 *
 * base64url rather than hex so the URL stays short enough to read out, and so
 * it survives being pasted into a chat client that eats punctuation.
 */
export function generateShareToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);

	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);

	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Cheap shape gate before the query, so nonsense never reaches the database.
 *
 * Exactly what `generateShareToken` produces: 43 characters of the base64url
 * alphabet, no padding.
 */
export function isShareToken(value: string): boolean {
	return /^[A-Za-z0-9_-]{43}$/.test(value);
}
