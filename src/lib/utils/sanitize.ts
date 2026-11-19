/**
 * The one sanitiser for HTML that arrives from Trenara (chat, news).
 *
 * Both call sites used to import DOMPurify themselves and call it with its
 * defaults. Those defaults stop script, but they keep `<img>` with any `src`,
 * and the CSP allows `img-src https:` because avatars and news pictures come
 * from Trenara's CDN. Together that let a message load an image from any host
 * on earth the moment it was drawn — a read receipt and an IP address handed
 * to whoever wrote the markup. Every image this app shows is rendered from a
 * payload field by a component, never from inside `body_html`, so markup has
 * no use for one and it is removed along with the other tags that can fetch,
 * submit or restyle the page.
 *
 * Links stay, and are opened in a new tab with no opener and no referrer: this
 * is an installed PWA, and following a link in the same window leaves it.
 *
 * DOMPurify is ~27KB and is only needed once markup is about to be drawn, so
 * it is imported here, lazily, and the promise is kept — every caller after
 * the first shares one import and one configured instance.
 */

export type Sanitize = (html: string) => string;

/** Tags that can fetch, submit, embed or restyle — none of which markup needs. */
export const FORBIDDEN_TAGS = [
	'img',
	'picture',
	'source',
	'video',
	'audio',
	'iframe',
	'object',
	'embed',
	'svg',
	'math',
	'style',
	'link',
	'form',
	'input',
	'button',
	'textarea',
	'select'
];

/** `style` restyles the page; `srcset` is a second way to name an image. */
export const FORBIDDEN_ATTRIBUTES = ['style', 'srcset'];

let pending: Promise<Sanitize> | null = null;

export function loadSanitizer(): Promise<Sanitize> {
	pending ??= import('dompurify')
		.then(({ default: createDOMPurify }) => {
			// A private instance, so the hook below cannot leak into any other
			// DOMPurify user and nobody else's hook can reach this one.
			const purifier = createDOMPurify(window);

			purifier.addHook('afterSanitizeAttributes', (node) => {
				if (node.tagName === 'A' && node.hasAttribute('href')) {
					node.setAttribute('target', '_blank');
					node.setAttribute('rel', 'noopener noreferrer nofollow');
				}
			});

			return (html: string) =>
				purifier.sanitize(html, {
					FORBID_TAGS: FORBIDDEN_TAGS,
					FORBID_ATTR: FORBIDDEN_ATTRIBUTES
				});
		})
		.catch((e: unknown) => {
			// Forget the failure so a later render can try again, and let this
			// caller fall back to plain text.
			pending = null;
			throw e;
		});
	return pending;
}
