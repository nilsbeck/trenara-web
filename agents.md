# Agent Instructions: Trainara web

## 1. Role & Context

You are a Senior Fullstack Engineer specializing in the **SvelteKit, Bun, and Supabase** ecosystem. Your goal is to build a lean, high-performance, and "Zero-Trust" web client for the reverse-engineered Trenara API. You prioritize native platform features over external libraries to minimize complexity and bundle size.

## 2. Core Tech Stack

- **Runtime & Package Manager:** Bun (Always use `bun` commands: `bun install`, `bun run dev`, `bun run test`).
- **Framework:** SvelteKit (Deployed on Vercel Free Tier).
- **Database & Auth:** Supabase.
- **UI & Styling:** Tailwind CSS v4 (CSS-first `@theme` in `src/app.css`, no `tailwind.config.js`), Lucide Svelte.
- **Validation:** Zod for schema and form validation.

## 3. Security Protocol (Strict)

- **Zero-Trust Backend:** Never trust `event.locals.user` alone. Re-verify the session in `hooks.server.ts` and `+page.server.ts` before sensitive operations.
- **State Validation:** Before any mutation, verify the current state server-side rather than trusting what the client sent. What a session allows is decided by the coach's own `can_*` flags on that training — check them upstream instead of re-deriving them in the browser.
- **Database Security:** **Row Level Security (RLS)** is the primary defense. Every table must have a policy.
- **XSS & Sanitization:** Use Svelte's native escaping. For HTML that comes back from the API (chat, news), sanitize with `dompurify`.
- **Session Management:** Use Supabase Auth Helpers. Ensure cookies are `HttpOnly`, `Secure`, and `SameSite=Lax`.
- **CSRF:** Use SvelteKit **Form Actions** for all data mutations to leverage built-in CSRF protection.
- always execute on the server-side
- use tokens for auth

## 4. UI Architecture & Reusability

- **Components:** Domain components live in `$lib/components`, grouped by feature (`calendar/`, `training/`, `chat/`, `charts/`). There is no UI primitive library — components are written directly against Tailwind classes.
- **Icons:** Use `lucide-svelte`.
- **Theming:** The app is dark only. The palette is defined once as `@theme` tokens in `src/app.css`; there is no light palette and no theme switcher.
- **Native-First:** Use native HTML validation attributes alongside Zod. Use SvelteKit’s `enhance` for progressive enhancement.

### Loading, empty, and error states

Anything fetched from the browser has three outcomes, and a component that
draws only two of them lies during the third.

- **Never let absence stand for two things.** "Nothing to report" and "not
  known yet" look identical on screen if the pending state renders nothing,
  and the reader takes the first reading as the answer. Every client-fetched
  reading needs a visible pending state distinct from its empty state.
- **Start loading flags `true`, not `false`.** A flag flipped on inside the
  fetch is still `false` for the server's render and the first client paint,
  so the component spends that gap asserting an answer it does not have. The
  flag describes "has this arrived", and until it has, the honest value is
  `true`.
- **The placeholder holds the layout.** Give it the footprint of the thing it
  stands in for, so content settles in place instead of arriving and shoving
  its neighbours sideways. `setup-rail-loading.svelte` and the goal card's
  trend badge are the pattern.
- **Say what is waiting.** `Loader2` from `lucide-svelte` with `animate-spin`
  and `aria-hidden="true"`, inside a `role="status"` wrapper carrying an
  `sr-only` sentence. A bare spinning glyph reads as nothing at all to a
  screen reader.
- **Tag transient states with `data-testid`.** They exist for a few hundred
  milliseconds and are otherwise unreachable from a test.

## 5. Coding Standards & Linting

- **Naming:** `kebab-case` for files/folders; `PascalCase` for Svelte components.
- **TypeScript:** - Strict mode enabled. No `any`.
  - Use `type` imports: `import type { User } from '@supabase/supabase-js'`.
  - Use `interface` for data models and component props.
- **Linting:** ESLint + Prettier (`bun run lint`). Tabs for indentation, single quotes, semi-colons required, 100-column print width — all enforced by `.prettierrc`, so run `bun run format` rather than matching it by hand.
- **Clean Code:** No `axios` (use `fetch`), no `lodash` (use native JS), no `onMount` for data fetching if a SvelteKit `load` function can do it.
- **Performance** use db indexing, and other best practices

## 6. Testing Strategy (Vitest)

- **Runner:** Vitest under jsdom — `bun run test`. Not `bun test`; the two are different runners and only Vitest is configured here.
- **Unit Tests:** All utility functions and pure logic must have a `*.test.ts` file in the same directory.
- **Component Tests:** `@testing-library/svelte` for components, mounted into jsdom.
- **Mocking:** Mock Supabase responses and SvelteKit `event` objects to ensure the "Sad Path" (errors) and "Happy Path" work as expected.
- **API Payloads:** `src/lib/server/trenara/payloads.test.ts` pins the reverse-engineered response shapes with `satisfies` clauses against fixtures transcribed from real traffic. Request bodies are pinned the same way, in `training.ts`. Update the fixture when the API changes — do not loosen the type.
- **Every outcome of a fetch, not just the good one:** a component that loads
  something needs a test for the pending state (hold the fetch open with an
  unresolved promise and assert against the first paint), for a response that
  carries nothing to show, and for a response that fails. The last two are
  where a spinner is left turning forever — assert the placeholder is _gone_,
  not merely that the content never came.
- **Trying a branch:** the maintainer tests branches as **Vercel preview deployments**, not with a local dev server. Anything meant to be seen or exercised by hand must therefore work in a production build: no `dev`-only code paths, no env-var flags to set, and diagnostics on screen rather than in a terminal.
