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

This section used to describe an architecture the code does not have — Supabase
Auth helpers, RLS as the primary defence, Form Actions for every mutation — and
a contributor following it would have built on premises that were not true.
What follows is the design as it actually stands.

- **Authentication is Trenara's, not Supabase's.** A runner signs in with their
  Trenara account; `/oauth/token` returns an access and refresh token which are
  kept in `httpOnly`, `Secure`, `SameSite=Lax` cookies by `TokenManager`.
  Supabase is a database here and nothing more — no Supabase Auth, no
  `auth.uid()`, no session helpers. `user_id` in every table is a Trenara id
  with no Supabase identity behind it.
- **Identity comes from the token and from nowhere else.** `hooks.server.ts`
  resolves the runner by calling `/api/me` through the read cache, keyed by the
  access token. Do not reintroduce a second source (a `user_id` cookie, a
  signed claim, a header): the previous design verified an HMAC over the id but
  never checked it against the token beside it, which made a signed pair a
  permanent capability valid alongside anybody's session.
- **One gate, in `hooks.server.ts`.** `handleGuard` redirects an
  unauthenticated visitor away from `/(app)` routes and refuses `/api` routes
  in JSON, before any route runs. Do not add per-route guards: the copies
  disagreed last time, and the layout and its pages race. Routes read the
  runner with `requireUser(locals)`, which narrows the type — never
  `locals.user!`.
- **State validation:** before any mutation, verify the current state
  server-side rather than trusting what the client sent. What a session allows
  is decided by the coach's own `can_*` flags on that training — check them
  upstream instead of re-deriving them in the browser.
- **Never store what the client composed.** The history endpoints take no body;
  they read `/api/me/stats` and `/api/goal` server-side. A record meant to
  outlive the data it describes must not be authored by a browser.
- **Database security:** RLS is enabled on all four tables with no policies,
  which denies everything. The server connects with the service role key and is
  exempt by design, so this is a floor rather than the defence: it closes the
  anon key and the public REST endpoint, and the DAO's `.eq('user_id', …)` is
  still what scopes a query the server makes. Every DAO must carry that filter.
  See the RLS block at the end of `migration.sql`.
- **Rate limiting:** login is limited by IP and by submitted username, and the
  endpoints that write to Supabase are limited per user
  (`$lib/server/security/rate-limit`). The limiters are per serverless instance
  and in memory — a floor, not a wall; a shared store is the upgrade path.
- **XSS & sanitization:** use Svelte's native escaping. For HTML that comes back
  from the API (chat, news), sanitize with `dompurify` — imported dynamically at
  the point of use, so it does not ride along in the layout chunk.
- **CSRF:** the mutations are JSON `+server.ts` routes, not Form Actions, and
  they are protected all the same. SvelteKit's origin check rejects a
  cross-origin `POST`/`PUT`/`DELETE` carrying any of the three form content
  types, and an `application/json` request needs a preflight this app never
  answers. The one thing that had to change was logout, which was a GET and so
  outside the check entirely; it is a POST now. Keep every mutation on a method
  that is not GET.
- **Response headers** are set in `$lib/server/security/headers`, which runs
  _first_ in the hook sequence — `handleGuard` returns its 401 without calling
  `resolve`, so anything behind it would miss the refusals. The CSP lives in
  `svelte.config.js`.
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
- **Linting:** ESLint + Prettier (`bun run lint`). Tabs for indentation, single quotes, semi-colons required, 100-column print width — all enforced by `.prettierrc`, so run `bun run format` rather than matching it by hand. ESLint covers `.svelte` files as well as `.ts`; two rules from the recommended Svelte set are off, each with its reason written beside it in `eslint.config.mjs`.
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
- **Coverage:** thresholds live in `vitest.config.ts` and CI runs `test:coverage`, so they are a gate rather than a wish. They sit just under where the suite actually stands; raise them as coverage rises rather than lowering them to fit a change.
- **CI** (`.github/workflows/check.yml`) runs type-check, lint, coverage and a production build, on pushes and pull requests. A change that passes locally and not there is a change that is not finished.
- **Trying a branch:** the maintainer tests branches as **Vercel preview deployments**, not with a local dev server. Anything meant to be seen or exercised by hand must therefore work in a production build: no `dev`-only code paths, no env-var flags to set, and diagnostics on screen rather than in a terminal.
