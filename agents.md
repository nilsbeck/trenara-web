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
- **One route is public on purpose: `/s/[token]`**, the shared-goal page.
  It sits outside both `/api` and `/(app)`, which is exactly why it needs no
  change to `handleGuard` — that hook only gates those two prefixes, and
  everything else passes through unauthenticated by construction. There is no
  session on this route and there must never be one: the token in the path
  _is_ the authorisation, resolved through `goalShareDAO.getLiveByToken`,
  which is scoped by the token's own unique index rather than by
  `.eq('user_id', …)` — the one query in the app that is deliberately built
  that way. What a token grants is exactly one read-only goal card, built from
  a stored projection (`$lib/server/share/snapshot.ts`) rather than a live
  Trenara call: this route makes **no Trenara request of any kind**, on any
  path, because doing so would mean keeping a runner's Trenara credential
  reachable by an anonymous visitor. If a change to this route ever needs to
  read `cookies` or call `trainingApi`/`userApi`, that is a sign the design
  has been broken, not a feature to add.
- **State validation:** before any mutation, verify the current state
  server-side rather than trusting what the client sent. What a session allows
  is decided by the coach's own `can_*` flags on that training — check them
  upstream instead of re-deriving them in the browser.
- **Never store what the client composed.** The history endpoints take no body;
  they read `/api/me/stats` and `/api/goal` server-side. A record meant to
  outlive the data it describes must not be authored by a browser.
- **Database security:** RLS is enabled on all five tables with no policies,
  which denies everything. The server connects with the service role key and is
  exempt by design, so this is a floor rather than the defence: it closes the
  anon key and the public REST endpoint, and the DAO's `.eq('user_id', …)` is
  still what scopes a query the server makes. Every DAO must carry that filter
  — `goalShareDAO.getLiveByToken` is the one documented exception, scoped by
  the token's unique index instead; every other method on it still carries
  `user_id`. See the RLS block at the end of `migration.sql`.
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
  its neighbours sideways. `setup-rail-loading.svelte` is the pattern. (The
  goal card's trend badge used to be the second example here — it no longer
  has a pending state at all, because `history` is now supplied to the card
  already resolved rather than fetched on mount; see "Reusing the goal card"
  in `.kiro/specs/goal-sharing/design.md`.)
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

## 7. Invariants — the things that were wrong once

Every rule here exists because the codebase already had the opposite, and the
opposite looked reasonable at the time. They are written as invariants rather
than as advice: if a change breaks one, the change is wrong, not the rule.
Where one is deliberately broken, say so at the site, in a comment that gives
the reason — that is what distinguishes a decision from a regression.

### Identity and access

- **One source of identity: the access token.** `hooks.server.ts` resolves the
  runner through `userApi.getCurrentUser`, which is cached. Never add a second
  source — a `user_id` cookie, a signed claim, an id in a request body. The
  previous design signed the id with an HMAC and still failed, because nothing
  checked the signature against the token beside it; two sources that are
  never compared are one source and one forgery.
- **One gate, in `hooks.server.ts`.** No `if (!locals.user)` in a route. The
  copies disagreed last time — the layout redirected, its pages threw 401, and
  they race — and the route that mattered had no copy at all.
- **`requireUser(locals)`, never `locals.user!`.** The bang asserts something
  the route has not checked; that is exactly how the dashboard ended up
  unguarded while every neighbour looked guarded.
- **Every mutation is a method that is not GET.** SvelteKit's origin check does
  not cover GET, so a `load` that changes state can be fired by any page that
  embeds it as an image. That is how logout was exploitable.
- **Every DAO query carries `.eq('user_id', …)`.** RLS is enabled but the
  server connects with the service role key and is exempt by design, so the
  filter — not the policy — is what scopes a server-side query.
- **The server never stores what the client composed.** If a record is meant to
  be trusted later, read it from the upstream on this side. Zod validating the
  _shape_ of a posted figure is not validation of the figure.

### Requests and caching

- **Every hot upstream read goes through `cachedRead`, and every write that
  could change it calls `invalidate`.** The budget is roughly sixty requests a
  minute for the whole app (see the ceilings below); a read outside the cache
  is a read against that. `getThreads` was the last one outside it and was
  costing more than the rest combined.
- **The cache holds the promise, not the answer.** That is what makes ten
  concurrent callers on a cold instance one upstream request rather than ten.
  Preserve it when touching `read-cache.ts`.
- **Client polling is gated on `document.visibilityState`.** A timer that runs
  in a backgrounded tab spends the budget for a screen nobody is looking at.
  `$lib/utils/revalidation` is the pattern; use it rather than a bare
  `setInterval`.
- **A local edit outranks an answer to a request that left before it.** Every
  session mutation hands back the changed object and the store seats it at
  once, so a background refresh already in flight is holding a payload that
  predates the change — seat that and the change is silently taken back off
  the screen. The calendar's month cache counts local edits (`editSeq`) and a
  request notes the count before it leaves; an answer that lands after the
  count moved is dropped, and the revalidation trigger asks again. A timestamp
  does not work here: two events inside one millisecond compare equal, and one
  of them must be seated.
- **`editSeq` only protects one page instance — a reload needs its own
  memory.** This is a serverless deployment, so the instance that answers a
  reload straight after a rating is not guaranteed to be the one that served
  the write, and its own cache invalidation (`read-cache.ts`) never reaches
  the other one. `rated-locally.ts` is what covers that: the rating flow
  remembers what it just told the server, in `localStorage`, for a few
  minutes, and `reconcileRatedEntries` patches it back onto any read that
  still shows the entry unrated. Call it wherever a fetched schedule is about
  to be trusted — `calendar.svelte.ts`'s `commitSchedule` covers the store,
  but `calendar.svelte`'s own opening-day effect reads the page's schedule
  prop directly and needs the same reconciliation before `initialCalendarDay`
  runs, not after.
- **Nothing unbounded sits on the first-paint critical path.** If a value is
  awaited in a layout load, either it is served from memory or its wait is
  bounded — `newsBadgeIfReady` races a 200ms timer for exactly this reason.
  Advisory data renders as absent rather than holding the page.
- **Every module-scope `Map` has a ceiling and an eviction rule.** They live as
  long as the serverless instance does. `read-cache` and the rate limiters
  carry one; see the ceilings below for the one that does not.

### Storage

- **A read, a comparison in JavaScript, and then a write is not atomic.** Both
  read-state tables advance with a single conditional `UPDATE … WHERE`, falling
  back to an insert whose unique violation is the already-ahead case. Two marks
  arriving together used to be able to interleave and let the older one land.
- **A failed write and a write that had nothing to do must not return the same
  thing.** `{ advanced: false }` means the mark was already far enough along;
  a failure raises. Collapsing the two hides data loss behind a correct-looking
  no-op.
- **Anything a client can name is a key it can invent.** A thread id, a goal
  name — check it against something the runner actually owns, and put a row cap
  behind that in the database.

### Bundle and rendering

- **Heavy libraries used on a branch are imported on that branch.** DOMPurify
  is `await import`ed at the point of use; a module-scope import in a component
  that lives in the layout ships on every page. Check the build output, not the
  intent: the chunk should be reached by `import(…)`, not from a node's static
  graph.
- **`{#each}` blocks are keyed**, with a key that identifies the item. Where
  position genuinely _is_ the identity — a chart column — say so with `(i)`
  rather than leaving it unkeyed.

### The tooling has to actually run

- **A check that is configured but never invoked is not a check.** The coverage
  thresholds were inert twice over: nothing ran `test:coverage`, and they were
  nested under a `global` key Vitest does not read, so the suite passed at 75.9%
  against a stated 80. After changing a threshold or a lint rule, prove it fails
  when it should.
- **CI runs what a contributor runs.** Type-check, lint, coverage and a
  production build. Anything CI does not run will drift.
- **Documentation that describes an architecture the code does not have is
  worse than none**, because it is followed. This file claimed Supabase Auth
  helpers, RLS as the primary defence, and Form Actions for every mutation —
  none of which were true. When the design changes, change §3 in the same
  commit.

## 8. Known ceilings

Honest limits, so nobody plans around capacity this app does not have. None of
these is a bug; each is a decision that suits one runner and would not suit a
crowd.

- **The upstream budget is the binding constraint, not this app's speed.**
  Trenara answers roughly sixty requests a minute, measured from an
  `x-ratelimit-limit` header on a refusal. **Whether that is per access token
  or per source IP has never been established**, and the answer changes the
  ceiling by orders of magnitude: per token, the app scales with Trenara; per
  IP, everything behind the same Vercel egress shares one pool of sixty. Find
  out before assuming.
- **A cold dashboard load costs about ten upstream requests** — five or six
  schedule weeks, the goal, the stats, the account, the news page, the thread
  list — plus half a dozen Supabase queries: the two `keepHistory` always
  wrote, one more for the goal card's prediction chart (now read server-side
  rather than fetched by the card), and one `UPDATE` for a shared goal's
  snapshot that matches no row for the large majority of runners who have
  never shared anything. Warm, most of that is free.
- **Every cache is per serverless instance.** Scaling out therefore makes the
  upstream load _worse_, not better: each new instance starts cold and repeats
  the fetches a warm one would have skipped. This is the first thing to fix if
  concurrency ever rises — a shared store (Vercel KV, Upstash), not longer TTLs.
- **`read-cache` holds 500 entries**, and a single active runner occupies five
  or six of them. That is roughly eighty concurrent runners per instance before
  it starts evicting entries that are still wanted, at which point the hit rate
  collapses and every request goes upstream.
- **The news badge cache holds two thousand readers per instance.** It used to
  hold every reader who had ever reached that instance, for the life of the
  instance — the TTL marked entries stale but nothing swept them. Bounded now,
  and the shape of that bug is worth remembering: a leak that only appears once
  there are enough people for it to matter.
- **Supabase is on a free tier.** `prediction_history` writes one row per
  runner per day, which is durable and small for one person and roughly
  thirty-six million rows a year at a hundred thousand.
- **`goal_share` is one row per shared goal, overwritten in place, never one
  row per snapshot and never one row per view.** A visitor viewing the shared
  page causes reads only — no write of any kind, on any path — so a link
  passed around a running club costs read volume, bounded by the per-IP
  `shareViews` limiter, and nothing else. There is no cron and no stored
  Trenara credential behind any of this: a snapshot is only ever as fresh as
  the owner's own last visit, by design — see
  `.kiro/specs/goal-sharing/design.md` for the reasoning. The same "only on
  the owner's next visit" rule is what closes a goal deleted or replaced in
  Trenara: `revokeStaleShares` (`$lib/server/share/refresh.ts`), run from the
  same `keepHistory` call as the snapshot refresh, revokes any live share
  whose `goal_id` no longer matches the runner's current goal. Until the
  owner opens the app again after deleting the goal, the old link still
  answers with its last snapshot — there is no faster signal than that visit.
