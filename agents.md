# Agent Instructions: Trainara web

## 1. Role & Context

You are a Senior Fullstack Engineer specializing in the **SvelteKit, Bun, and Supabase** ecosystem. Your goal is to build a lean, high-performance, and "Zero-Trust" web client for the reverse-engineered Trenara API. You prioritize native platform features over external libraries to minimize complexity and bundle size.

**When a reply asks the maintainer to manually do something** (run a migration, set an env var, rotate a key, click through a dashboard) — never bury that instruction mid-paragraph next to unrelated explanation. Put it in a clearly marked block at the end of the reply, so it cannot be skimmed past.

## 2. Core Tech Stack

- **Runtime & Package Manager:** Bun (Always use `bun` commands: `bun install`, `bun run dev`, `bun run test`).
- **Framework:** SvelteKit (Deployed on Vercel Free Tier).
- **Database & Auth:** Supabase.
- **UI & Styling:** Tailwind CSS v4 (CSS-first `@theme` in `src/app.css`, no `tailwind.config.js`), Lucide Svelte.
- **Validation:** Zod for schema and form validation.

### What the tooling refuses outright

These are errors, not advice — `bun run lint` and `bun run check:bundle` fail on
them, and each message names the section that explains it. Where a site breaks
one on purpose it carries an `eslint-disable-next-line` with the reason beside
it (§7).

| Pattern                                                       | Instead                                          | Why |
| ------------------------------------------------------------- | ------------------------------------------------ | --- |
| `locals.user!`                                                | `requireUser(locals)`                            | §7  |
| `.toISOString().slice/split/substring(…)`                     | `$lib/utils/date`                                | §9  |
| `setInterval(…)`                                              | `$lib/utils/revalidation`                        | §7  |
| `innerHTML =`, `outerHTML =`, `insertAdjacentHTML`            | `loadSanitizer()` and `{@html}`                  | §3  |
| `{@html}` without a reason                                    | `svelte/no-at-html-tags` is on; disable with why | §3  |
| `import … from 'dompurify'`, or `import('dompurify')`         | `loadSanitizer()` from `$lib/utils/sanitize`     | §3  |
| `axios`, `lodash`, `svelte/store`                             | `fetch`, native JS, runes                        | §5  |
| DOMPurify reachable without `import()`; shell over its budget | `scripts/check-bundle.ts`, after `bun run build` | §7  |

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
- **Identity and the gate** — one source of identity (the access token,
  resolved in `hooks.server.ts`), one gate (`handleGuard`, which redirects
  `/(app)` and refuses `/api` in JSON), and `requireUser(locals)` in every
  route. The rules and the history behind them are in §7, Identity and access;
  they are stated once, there.
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
- **A second public route meets the same bar as the first**, or it is not
  added. Before merging one, every line of this must be true and tested:
  - it lives outside `/api` and `/(app)`, and reads no cookie and no `locals.user`;
  - it makes no Trenara request, on any path — it serves a stored projection;
  - the capability in the URL is random (`crypto.getRandomValues`, as
    `$lib/server/share/token.ts` does, 256 bits), unique-indexed, and
    revocable by its owner;
  - its lookup is the only query scoped by something other than `user_id`,
    and says so in a comment at the site;
  - it has a per-IP limiter in `$lib/server/security/rate-limit`;
  - it causes reads only — a view never writes;
  - its `cache-control` is no longer than the revocation delay the owner has
    been promised (§8).
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
- **XSS & sanitization:** use Svelte's native escaping. HTML that comes back
  from the API (chat, news) reaches the DOM only through `loadSanitizer()` in
  `$lib/utils/sanitize`, which owns DOMPurify's configuration and imports it
  lazily. The configuration is part of the security model, not a detail:
  DOMPurify's defaults keep `<img>`, and the CSP's `img-src https:` (needed for
  avatars and news pictures) would then let a message load an image from any
  host — a read receipt and the reader's IP for whoever wrote the markup. So
  markup loses every tag that can fetch, embed, submit or restyle, and links
  open with `rel="noopener noreferrer nofollow"`. Images the app shows come
  from payload fields, rendered by a component, never from inside markup.
  Widening the config — allowing a tag back — needs a test in
  `sanitize.test.ts` and a reason in the commit.
- **Request bodies are bounded by their schema.** Every string and array a
  client can post has a `.max()`, so `parseBody` limits size as well as shape
  and nothing arbitrary is forwarded upstream. The ceiling is a guard, set well
  past real input; the product rule, where there is one, is applied after
  parsing.
- **Secrets stay in `$lib/server`.** `$env/static/private`, `$env/dynamic/private`
  and the service-role client are imported only under `$lib/server` or from a
  `*.server.ts` / `+server.ts` file — SvelteKit refuses the build otherwise; do
  not route around it through a re-export. A `load` returns only what the page
  renders: never a token, a cookie value, or a whole database row when the
  page needs three of its fields, because a load's return value is serialised
  into the HTML.
- **Logging:** never log a token, a cookie, an `Authorization` header, a
  request body, or an email. Identify the runner by their Trenara id. The
  transport's error classes (`HttpError`, `RateLimitError`, …) are safe to log
  whole because they carry a status and Trenara's refusal body, never the
  request's headers — keep it that way when adding a field to one. A database
  error is logged with its message only (`storageFailed` does this); its
  details name columns.
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
- **Everything that touches Trenara or Supabase runs on the server.** The
  browser talks only to this app (`connect-src 'self'`); it never holds a
  Trenara token, a Supabase key, or a URL on either host.

## 4. UI Architecture & Reusability

- **Components:** Domain components live in `$lib/components`, grouped by feature (`calendar/`, `training/`, `chat/`, `charts/`). There is no UI primitive library — components are written directly against Tailwind classes.
- **Icons:** Use `lucide-svelte`.
- **Theming:** The app is dark only. The palette is defined once as `@theme` tokens in `src/app.css`; there is no light palette and no theme switcher.
- **Native-First:** Use native HTML validation attributes alongside Zod. The login form is the one Form Action, with `enhance`; every other mutation is a `fetch` to a JSON route under `/api/v1` (see §3, CSRF, and §9).

### View and view-model

A component draws; a view-model knows. The split is Model–View–ViewModel, and
the codebase already has one half of it — the model is `$lib/server/trenara/*`
and the DAOs, reached through `/api/v1` — and the right shape for the other half
in `SessionDetailStore` and `createCalendarStore`. What it does not yet have is
the rule, and it shows: four components (`goal-card`, `training-details`,
`chat-bubble`, `prediction-chart`) run to between seven and nine hundred lines,
most of it logic rather than markup, and eight components call `fetch`
themselves — logic that can only be tested by mounting it.

- **Model** — the server: Trenara wrappers and DAOs. The browser reaches it
  only through `fetch('/api/v1/…')`.
- **View-model** — a `$lib/stores/*.svelte.ts` module: a factory
  (`createCalendarStore`), a class with `$state` fields
  (`SessionDetailStore`), or a module-level `$state` holder
  (`app-config.svelte.ts`). It owns the requests, the loading / empty / error
  state of each (below), the derived values, and the mutations. It imports
  nothing from `.svelte` files and touches no DOM, so it is tested directly,
  without jsdom rendering (`calendar.test.ts`, `session-detail.test.ts`).
- **View** — a `.svelte` file that reads the view-model, renders, and calls
  its methods on events. Its test asserts what is drawn for a given state; it
  does not need to mock `fetch` to get there.

When a component owns a request, more than one `$effect`, or passes roughly
three hundred lines, the next change to it moves its logic into a view-model
rather than adding to the pile. Refactor on the way through, in its own commit
(§9) — not as a rewrite nobody asked for.

Within either half:

- **`$derived` for anything computed from other state; `$effect` only to sync
  with something outside Svelte** — the DOM, a timer, `localStorage`, a
  listener. An effect that writes `$state` is almost always a `$derived` that
  has not been written yet; where it genuinely is not, say why beside it.
  `untrack` is a sign of the same thing and needs the same comment.
- **Props down, callbacks up.** A view-model has one owner: the component
  that creates it (`calendar.svelte` creates the calendar store,
  `training-details.svelte` its `SessionDetailStore`). Everything beneath
  receives it, or the values it draws, as props — importing the store's
  _type_ is fine, importing an instance is not — and reports intent through
  callback props (`onchange`, `onsave`). `appConfig` is the one app-wide
  singleton, by design; a second is how two screens end up sharing state
  neither of them owns.
- **Server data enters through `load`, once** (§7, "Load data is a
  snapshot"). A view-model is seeded from it and then owns the copy; it does
  not re-read `data.x` in an effect.

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
- **Performance:** the rules are in §7 (Requests and caching, Storage, Bundle
  and rendering) and the limits in §8. The short version: every upstream read
  is cached, every list query is bounded, first paint waits on nothing
  unbounded, and the signed-in shell has a byte budget CI enforces.

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
- **CI** (`.github/workflows/check.yml`) runs type-check, lint, coverage, a production build and the bundle budget, on pushes and pull requests. A change that passes locally and not there is a change that is not finished.
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
- **Load data is a snapshot from when the load ran; seat it once.**
  SvelteKit hands a page a new `data` object whenever any load above it
  re-runs, with the page's own fields carried over by reference — so an effect
  that tracks `data.x` fires again with the same, older `x`. The calendar
  re-seated `data.schedule` that way on every `invalidate('app:news')`, and a
  PWA resumed the next day asked for a rating the runner had already given.
  Anything seeded from load data compares the reference before seating it.
- **A local edit lands in every copy that holds it.** A week that straddles
  two months sits in both months' caches; `replaceEntry` / `replaceTraining`
  patch each month holding the id, not only the one on screen.
- **Nothing unbounded sits on the first-paint critical path.** If a value is
  awaited in a layout load, either it is served from memory or its wait is
  bounded — `newsBadgeIfReady` races a 200ms timer for exactly this reason.
  Advisory data renders as absent rather than holding the page.
- **Work the page does not read finishes after the response.** A write that
  rides along with a load — `keepHistory` is the case — goes through
  `afterResponse` (`$lib/server/after-response`), which keeps the serverless
  function alive with `waitUntil` until it settles. Awaiting it holds first
  paint for nothing on screen; leaving it running bare is not reliable, since
  the function can be frozen the moment it answers. If the page shows what the
  write produced, derive that from what the load already holds, as
  `withCurrentReading` does for the chart, rather than reading the write back.
- **Reads that do not depend on each other run together.** A read that needs
  one value (the goal's id) chains on that value's promise, not on the end of
  the `Promise.all` it sits in — the dashboard's chart and share reads run
  beside the schedule, not after it.
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
- **A new query that returns a list is bounded** — by `.limit()`, or by a
  row-cap trigger on the table — and the site says which. An unbounded read is
  fine for one runner and is what falls over at a hundred thousand (§8). Of the
  existing ones, `goal_history` reads are bounded by its row cap;
  `prediction_history` reads take an optional `limit` and otherwise grow by a
  row a day per runner, which is the ceiling in §8.
- **A query that needs part of a row names the columns.** `select('*')` is
  right only when the result is cast to an interface that is the whole table,
  as the four existing ones are; a new column added to the table for another
  feature then rides along with every such read, so do not reach for `*` to
  save typing.
- **A new filter or sort column gets its index in the same migration**, led by
  `user_id` (§9, Touching the database). Check the query plan in the SQL
  editor (`EXPLAIN`) for anything that reads more than one runner's day.

### Bundle and rendering

- **Heavy libraries used on a branch are imported on that branch.** DOMPurify
  is `await import`ed at the point of use; a module-scope import in a component
  that lives in the layout ships on every page. Check the build output, not the
  intent: the chunk should be reached by `import(…)`, not from a node's static
  graph. The session card's dialogs follow the same rule: the button is drawn
  with the card, the dialog behind it lives in its own file and is loaded
  through `loadOnce` (`$lib/utils/load-once`), warmed with `whenIdle` and
  mounted on the first tap (`change-date-modal.svelte` is the pattern). A
  failed load on a tap reloads the page — after a deploy the old chunk names
  are gone — and a failed warm-up stays quiet. Each is listed in `LAZY_ONLY`.
- **`{#each}` blocks are keyed**, with a key that identifies the item. Where
  position genuinely _is_ the identity — a chart column — say so with `(i)`
  rather than leaving it unkeyed.
- **The signed-in shell has a byte budget.** `bun run check:bundle` (in CI,
  after the build) sums the client entry, the root and `(app)` layouts and
  everything they import statically, gzipped, and fails past the budget in
  `scripts/check-bundle.ts`. It also fails if DOMPurify becomes reachable
  without `import()`. The budget sits just above where the build stands; raise
  it in the commit that needs the room and say why, as with coverage.
- **A new dependency justifies its bytes.** Before adding one, check its
  gzipped size and whether the platform already does the job (§1: native
  first). If it is only needed on one branch — a modal, a chart, an export —
  it is `import()`ed on that branch, and if it must stay that way it goes into
  `LAZY_ONLY` in `scripts/check-bundle.ts` so the build proves it.
- **Stream what is below the fold; await what is chrome.** A `load` that
  returns a promise lets the page paint before it settles — right for a chart
  further down the dashboard, wrong for the navbar, because a streamed value is
  _always_ pending first and anything that is the same on every page then
  flickers on every page (`(app)/+layout.server.ts` explains the case that
  taught this). Streamed values render with `{#await}` and follow "Loading,
  empty, and error states" (§4).

### The tooling has to actually run

- **A check that is configured but never invoked is not a check.** The coverage
  thresholds were inert twice over: nothing ran `test:coverage`, and they were
  nested under a `global` key Vitest does not read, so the suite passed at 75.9%
  against a stated 80. After changing a threshold or a lint rule, prove it fails
  when it should.
- **CI runs what a contributor runs.** Type-check, lint, coverage, a
  production build and its bundle budget. Anything CI does not run will drift.
- **An invariant that grep can see is a lint rule, not a sentence.** The
  table in §2 lists the ones that are. When a new rule in this file can be
  expressed as a `no-restricted-syntax` selector or an import ban, add it to
  `eslint.config.mjs` in the same commit, and prove it fires on a probe file
  before trusting it.
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
  never shared anything. The `keepHistory` writes finish after the response
  (§7), so they cost the function time, not the runner. Warm, most of that is
  free. The functions run in `fra1` (`svelte.config.js`), beside Supabase in
  `eu-central-1` and Trenara on OVH in France; a region further from either
  puts a long round trip on every step of that chain.
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
- **The shared page is cached by the browser, not by Vercel's CDN.** It sends
  `public, max-age=60` and no `s-maxage`, which is what Vercel's CDN caches on,
  so every first view from a new visitor still reaches a serverless function
  and Supabase (confirm with the `x-vercel-cache` header on a preview before
  relying on either reading). Adding `s-maxage` would let the CDN answer
  a link passed round a club without either — at the cost that a revoked link
  keeps answering for as long as the CDN holds it. That trade is the owner's
  revocation delay, and it is not made silently.
- **`prediction_history.recorded_at` is the UTC day**, the one date in the app
  that is not the runner's local day: it is computed on a server that has no
  time zone for the runner, as the bucket behind the one-row-per-day upsert.
  A runner well east or west of Greenwich can see a reading land on the
  neighbouring day. Fixing it needs the runner's time zone on the server
  first.

## 9. Making a change

§3 and §7 say what must not break; this section says where a change goes and
which helpers it uses. When a file disagrees with this section, the file is
the drift — fix it rather than copying it.

### Where things go

| Layer           | Location                                           | Use                                                                                                                                    |
| --------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Page data       | `+page.server.ts` / `+layout.server.ts`            | `requireUser(locals)`; await only what first paint needs, stream the rest (§7, first-paint)                                            |
| JSON endpoint   | `src/routes/api/v1/**/+server.ts`                  | `parseBody(schema, await request.json())`, then `passthrough(() => …Api.x())`; never a hand-rolled `safeParse` or field-by-field check |
| Body schemas    | `$lib/schemas/*.ts`, with a `*.test.ts`            | shape only; what is _allowed_ is Trenara's `can_*` flags                                                                               |
| Upstream calls  | `$lib/server/trenara/{training,user,chat,news}.ts` | reads through `cachedRead` with a `CacheKey`; writes through `mutating`; shape checked with `expectObject` / `expectCollections`       |
| Upstream types  | `$lib/server/trenara/types.ts`                     | what captured traffic held, not what we hope for                                                                                       |
| Storage         | `$lib/server/db/*.ts`                              | singleton DAO, `.eq('user_id', …)`, `storageFailed()` on error; the route wraps the call in `fromStorage`                              |
| Client state    | `$lib/stores/*.svelte.ts`                          | the view-model (§4); runes, not `svelte/store`; a factory, a class with `$state` fields, or a module-level `$state` holder             |
| Client → server | `fetch('/api/v1/…')` from a component or store     | a failure the runner sees is worded by `describeResponse` / `describeError` (`$lib/utils/network`)                                     |
| Pure logic      | `$lib/utils/*.ts`, with a `*.test.ts` beside it    | no SvelteKit imports, so it tests without mocks                                                                                        |

Failures are told apart by which server failed, and each has one helper:

- **Trenara** → `passthrough`, which answers 502 / 504 / 429 or relays
  Trenara's own refusal with its message. A read that may legitimately find
  nothing uses `passthroughOptional` (404 → `null`) rather than a try/catch.
- **Our database** → `fromStorage`, which answers 503 with `storage: true`.
- Never answer one with the other's status: the error page tells the runner
  which server to blame from exactly this.

### Touching the upstream API

`docs/backend-api.md` is the contract, captured from live traffic. A new or
changed endpoint updates, in the same commit: that file (with a redacted
captured sample), `types.ts`, the wrapper in `$lib/server/trenara/`, and a
fixture in `payloads.test.ts`. Never type a field that was not seen in a
capture, and use the path exactly as recorded — trailing slashes vary.

### Touching the database

- Append to `src/lib/server/db/migration.sql`; never edit what is already
  there, because it has already been run. Every statement is idempotent
  (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS`), so the whole
  file can be run again safely.
- A new table has `user_id INTEGER NOT NULL`, an index that leads with
  `user_id`, `ENABLE ROW LEVEL SECURITY` and `REVOKE ALL … FROM anon,
authenticated`. When nothing bounds its rows per runner — a key the client
  can name, a row per event — it also gets a row-cap trigger like the ones on
  `goal_history`, `chat_read_state` and `goal_share`.
- The migration is run by hand in the Supabase SQL editor. Say so in the
  maintainer-action block at the end of the reply (§1), with the exact SQL to
  paste — not the whole file.

### Dates

A training day is a local day. Calendar dates go through `$lib/utils/date`
(`toLocalDateString`, `dayKeyOf`, `getMonthTimestamps`,
`parseLocalDateString`) — never `toISOString().slice(0, 10)`, which is the UTC
day and is wrong for a runner east or west of Greenwich for part of every
day. Upstream sends unix seconds, ISO-8601 with an offset, and plain dates,
chosen per field; the API reference says which.

### Tests that can fail

- **A bug fix starts with a test that fails on the old code**, and the commit
  says that it did. A test written after the fix and never seen red proves
  nothing about the bug.
- **Mock Trenara as it behaves, not as it should.** A re-read straight after a
  write may still return the state before it; a record the account does not
  have is a 404 with `{"message":"No result found"}`; a 429 carries
  `retry-after`. A mock more consistent than the upstream hides exactly the
  bugs this app has had — the stale-day bug in the move flow passed its first
  test for this reason.
- **A `+server.ts` has a `server.test.ts` beside it.**
  `api/v1/goal-share/server.test.ts` is the pattern: import the handlers, mock
  `$lib/server/trenara` and the DAO, and cover a rejected body, the happy path,
  and an upstream refusal passed through with its status.

### Platform edges

- **Environment:** only the variables in `.env.example`. A new one goes there,
  into the CI placeholders in `check.yml`, into the `$env` mocks in
  `src/lib/server/database/test-setup.ts`, and into the maintainer-action
  block.
- **CSP:** the browser talks only to this app. A new external origin — a font,
  an image host, a script — needs its directive in `svelte.config.js`.
- **Service worker:** caches the built shell and static files only, never an
  API response or a rendered page; see the comment at the top of
  `src/service-worker.ts` for why.
- **Time budgets come in a pair:** `DEFAULT_BUDGET_MS` in
  `$lib/server/trenara/client.ts` sits inside `maxDuration` in
  `svelte.config.js`. Change one, check the other.

### Done means

A change is finished when every line for its kind is true. The lines point at
the rule; they do not restate it.

**A new JSON endpoint**

- [ ] under `src/routes/api/v1/`, on a method that is not GET if it changes anything (§7)
- [ ] `requireUser(locals)`; no guard of its own (§7)
- [ ] body through `parseBody` with a schema in `$lib/schemas/`, every string and array `.max()`ed (§3)
- [ ] upstream through `passthrough` / `passthroughOptional`, storage through `fromStorage` (§9)
- [ ] a read goes through `cachedRead`; a write `invalidate`s what it changes (§7)
- [ ] a write to Supabase is behind a per-user limiter (§3)
- [ ] `server.test.ts` beside it: rejected body, happy path, upstream refusal with its status (§9)

**A new upstream call** — everything in "Touching the upstream API" above, in one commit.

**A new table or column**

- [ ] appended to `migration.sql`, idempotent (§9)
- [ ] `user_id INTEGER NOT NULL`, an index led by `user_id`, RLS on, `anon`/`authenticated` revoked
- [ ] a row cap if nothing else bounds it; every list query on it bounded (§7, Storage)
- [ ] the maintainer-action block carries the exact SQL (§1)

**A new component or screen**

- [ ] logic that fetches or derives lives in a view-model, not the component (§4)
- [ ] pending, empty and failed each drawn and each tested (§4, §6)
- [ ] `{#each}` keyed; `$effect` only for outside-Svelte sync (§4, §7)
- [ ] any library used only on one branch is `import()`ed there, and `bun run check:bundle` passes (§7)
- [ ] `README.md` feature list updated if a runner can see it (below)

**Any change**

- [ ] `bun run check && bun run lint && bun run test:coverage && bun run build && bun run check:bundle`
- [ ] a changed invariant updates §3 or §7, and a lint rule if grep can see it (§7)
- [ ] anything the maintainer has to do by hand is in the block at the end of the reply (§1)

### Commits and pull requests

- One concern per pull request. A fix to drift found on the way goes in its
  own commit.
- Commit subjects are imperative and sentence-case, with no `feat:`/`fix:`
  prefix ("Cap forecast gain at the current gap to goal"). The body says why,
  and how the change was verified.
- Comments explain _why_, including what was wrong before — match the density
  of the file you are in; a bare function in a file of reasons reads as
  unreviewed.
- A feature a runner can see updates the feature list in `README.md` in the
  same pull request. A changed invariant updates §3 or §7 in the same commit.
