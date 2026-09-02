# Implementation Plan

Ordered so that each step leaves the app working and testable. Steps 1–4 are
invisible to the runner; the feature first appears on screen at step 6, and is
usable end to end at step 8.

- [ ] 1. Database schema

  - Append the `goal_share` table, its two indexes, the RLS enable, the
    `REVOKE`, and the row-cap trigger to `src/lib/server/db/migration.sql`,
    in the file's established commented style
  - Run it in the Supabase SQL editor and confirm the anon key cannot read the
    table
  - _Requirements: 6.1, 6.4, 6.7, 7.5_

- [ ] 2. Token generation

  - `src/lib/server/share/token.ts`: `generateShareToken` (32 bytes from
    `crypto.getRandomValues`, base64url) and `isShareToken`
  - `token.test.ts`: length, alphabet, distinctness over many draws, and the
    shape gate's accepts/rejects
  - _Requirements: 1.3, 6.4_

- [ ] 3. The snapshot projection

  - `src/lib/server/share/snapshot.ts`: the `SharedSnapshot` type and
    `projectSnapshot(goal, stats)` returning null when either is unusable
  - Narrow `goal-card.svelte`'s props to `GoalCardGoal` / `GoalCardStats` and
    confirm the dashboard and `/goal` still type-check unchanged — this is what
    makes the projection a checked contract rather than a comment
  - `snapshot.test.ts`: the produced key set matches the type exactly against a
    full `Goal`/`UserStats` fixture, so an upstream field cannot ride along
  - _Requirements: 4.1, 4.2, 4.3, 7.6_

- [ ] 4. Data access layer

  - `src/lib/server/db/goal-share.ts`: `getForGoal`, `issue` (upsert on
    `(user_id, goal_id)`, rotating the token), `revoke`, `refreshSnapshot`
    (single conditional `UPDATE`, never read-compare-write), `getLiveByToken`
    (explicit column list, null for revoked and missing alike)
  - Errors through `storageFailed` / `fromStorage`, as the other DAOs do
  - `goal-share.test.ts` against the mocked client, including the assertion
    that every owner-scoped query carries `.eq('user_id', …)`
  - _Requirements: 5.2, 5.3, 5.4, 6.1, 7.4_

- [ ] 5. Snapshot refresh on the owner's page loads

  - `src/lib/server/share/refresh.ts`: `refreshShareSnapshot(userId, goal, stats)` — takes the
    data rather than fetching it, throttled by a named fifteen-minute constant, never rejects
  - Call it from `keepHistory` in `$lib/server/history/record.ts` (dashboard,
    inside the existing `Promise.all`) and from `/goal`'s load, hung off the
    streamed promises so the page still streams
  - `refresh.test.ts`: throttle honoured, null inputs write nothing, storage
    failure resolves
  - _Requirements: 3.1, 3.2, 3.3, 7.2_

- [ ] 6. Share API endpoint

  - `src/routes/api/v1/goal-share/+server.ts` with `GET`, `POST`, `DELETE`
  - Goal id read server-side from `trainingApi.getGoal(cookies)`, never from
    the body; `title` trimmed and capped at 80; absolute URL built from the
    request origin
  - `storageWrites` limiter on `POST` and `DELETE`; `requireUser(locals)` for
    identity
  - `POST` writes the first snapshot in the same request, so a fresh link is
    never born blank
  - Endpoint tests including the 401 through the hook, the ignored body id, and
    the limiter refusals
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 5.1, 5.3, 6.6, 7.1, 7.2, 7.3_

- [ ] 7. Goal card: supplied history and reduced views

  - Add the `history` and `views` props; make `onMount`'s three calls
    conditional on `history === undefined`
  - Collapse the graph picker to its title when `views` has one entry, dropping
    the arrows from the DOM rather than hiding them
  - `goal-card.shared.test.ts`: no `fetch` at all with history supplied; no
    picker arrows and no distance graphs with `views: ['prediction']`
  - Confirm the dashboard and `/goal` are untouched in behaviour
  - _Requirements: 2.3, 2.4, 2.5, 2.6, 7.6, 7.7_

- [ ] 8. The public route

  - `src/routes/s/[token]/+page.server.ts`: IP limiter, token shape gate,
    `getLiveByToken`, prediction history read from the goal's start date
    (limit 200), `noindex` header, one-minute cache header, and a comment
    stating why this route is public
  - `src/routes/s/[token]/+page.svelte`: the slim public shell — title, name,
    "Updated …", the card in shared mode, disclaimer footer
  - `$lib/utils/relative-time.ts` (+ test) for the "Updated 3 hours ago"
    wording, if nothing in `$lib/utils/date` already covers it
  - The four outcomes drawn distinctly: card, waiting-for-first-snapshot,
    404 for revoked and unknown alike, storage failure
  - Neutral `<svelte:head>` Open Graph tags; `static/robots.txt` with
    `Disallow: /s/`
  - `share-page.test.ts` covering all four outcomes and the header
  - _Requirements: 2.1, 2.2, 2.7, 2.8, 3.4, 3.5, 3.6, 4.4, 4.5, 4.6, 6.2, 6.3, 7.1_

- [ ] 9. View limiter

  - `shareViews` added to `$lib/server/security/rate-limit.ts` with the same
    per-instance caveat the neighbours carry, plus its test
  - _Requirements: 6.5_

- [ ] 10. The share control

  - `src/lib/components/goal/goal-card-share.svelte`: the dialog with its
    three states (unknown / none / live), the copy confirmation, and a
    selectable URL where the clipboard API is unavailable
  - Rendered into the card header on `/goal` only, passed as a snippet so the
    card gains no knowledge of sharing and the dashboard is unaffected
  - Loading flag starts `true`; spinner inside a `role="status"` wrapper with
    an `sr-only` sentence; transient states tagged with `data-testid`
  - `goal-card-share.test.ts`: the three states plus the fetch's pending and
    failed outcomes
  - _Requirements: 1.1, 1.2, 1.5, 1.6, 1.7, 5.1_

- [ ] 11. Documentation

  - `agents.md` §3: the public route, why it is public, and what a token grants
  - `agents.md` §8: the storage shape (one row per shared goal, no per-view
    write) among the known ceilings
  - `README.md`: a line under "Goals and predictions" describing sharing, and
    the freshness caveat in the runner's own terms
  - _Requirements: 7.9_

- [ ] 12. Verify end to end

  - `bun run check`, `bun run lint`, `bun run test:coverage`, `bun run build`
  - On a Vercel preview: create a link, open it in a private window, confirm no
    authenticated call is made and nothing 401s; revoke it and confirm the 404;
    re-check that the owner's dashboard and goal page are unchanged
  - Re-check the coverage thresholds and raise them if the number moved up
  - _Requirements: all_
