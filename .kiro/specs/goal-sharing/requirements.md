# Requirements Document

## Introduction

A runner can hand a friend a link to their goal. Opening it shows the goal
card — the target, the progress, the prediction history and the forecast —
without a Trenara account, a Trainara account, or a sign-in of any kind.
Opening the same link a week later shows the same goal with newer numbers.

The whole feature rests on one constraint, which decides most of what follows:
**everything on the goal card comes from Trenara, and Trenara only answers a
request that carries the runner's own access token** (`src/hooks.server.ts`,
`$lib/server/trenara/user`). A visitor has no token and must never be given
one, so a public page cannot fetch. It can only read something the app already
wrote down.

That is the design: the app writes a snapshot of the goal card's inputs to
Supabase whenever the owner opens Trainara, and the public page renders the
newest snapshot. "Updated data days later" means _updated as of the owner's
last visit_, said plainly on the page. No credential is stored, no background
job runs, and a shared link costs Trenara nothing — which matters, because the
upstream budget is roughly sixty requests a minute for the whole app and a
link is a thing strangers can refresh.

## Requirements

### Requirement 1 — Creating a link

**User Story:** As a runner, I want to create a link to my current goal, so
that I can send it to friends who want to follow my training.

#### Acceptance Criteria

1. WHEN the runner opens `/goal` with an active goal THEN the goal card header
   SHALL show a share control.
2. WHEN the runner activates the share control AND no link exists for the
   current goal THEN the system SHALL offer an optional title (max 80
   characters) and a "Create link" action.
3. WHEN the runner creates a link THEN the system SHALL generate a token of at
   least 32 bytes of cryptographic randomness and return the absolute URL.
4. WHEN a link is created THEN the system SHALL record it against the Trenara
   goal id the runner currently holds, read server-side from `/api/goal` —
   never from a value the browser sent.
5. WHEN a link already exists for the current goal THEN the share control SHALL
   show that URL with a copy action rather than creating a second one.
6. WHEN the runner has no goal THEN the share control SHALL NOT be shown.
7. WHEN the copy action is used THEN the system SHALL confirm visibly that the
   URL was copied, and SHALL leave the URL selectable as text where the
   clipboard API is unavailable.

### Requirement 2 — Viewing a shared goal

**User Story:** As a friend, I want to open the link and see how the training
is going, without signing up for anything.

#### Acceptance Criteria

1. WHEN anyone requests `/s/<token>` for a live link THEN the system SHALL
   render the goal page without requiring authentication.
2. WHEN the page renders THEN it SHALL show: the display title, the runner's
   first name, the goal name, distance, target time and pace, the end date,
   the weeks remaining, the progress bar, the current predicted time and pace,
   and the gap between prediction and target.
3. WHEN the page renders THEN it SHALL show the Prediction Progress graph with
   the recorded prediction history, the goal reference line, the forecast line,
   the weekly load bars, the trend badge and the shortfall note — the same
   readings, with the same wording, the owner sees on their own card.
4. WHEN the page renders THEN it SHALL show the forecast basis line, including
   the kilometres completed against the kilometres asked for.
5. WHEN the page renders THEN it SHALL NOT show the "Distance This Week" or
   "Distance By Week" graphs, and SHALL NOT show the predictions table for
   5K/10K/half/marathon.
6. WHEN only one graph is available THEN the graph picker and its arrows SHALL
   NOT be rendered, and the graph title SHALL still be shown.
7. WHEN the page renders THEN it SHALL NOT link to any authenticated route and
   SHALL NOT render the app's navigation shell.
8. WHEN the visitor's browser requests it THEN the page SHALL be responsive on
   a phone, and SHALL use the app's existing dark palette.

### Requirement 3 — Freshness, stated rather than implied

**User Story:** As a friend, I want to know how current the numbers are, so
that I do not read a fortnight-old prediction as today's.

#### Acceptance Criteria

1. WHEN the owner loads the dashboard or the goal page AND a live link exists
   for their current goal THEN the system SHALL refresh that link's snapshot
   from the data those pages already fetched.
2. WHEN a snapshot was written less than the throttle interval ago THEN the
   system SHALL NOT write again.
3. WHEN the snapshot refresh fails THEN it SHALL NOT fail the owner's page.
4. WHEN the shared page renders THEN it SHALL show when the snapshot was taken,
   as a relative phrase ("Updated 3 hours ago", "Updated 6 days ago").
5. WHEN the snapshot is old THEN the page SHALL still render every part of
   itself. Nothing is hidden, suppressed or frozen on account of age.
6. WHEN the prediction history is read for the shared page THEN it SHALL be the
   owner's recorded history from the goal's start date, filtered to this goal's
   distance by the existing `splitByGoalDistance` — the same series, and the
   same exclusions, as the owner's own card.

### Requirement 4 — What a link exposes, and what it never does

**User Story:** As a runner, I want to know exactly what a link gives away, so
that I can decide who to send it to.

#### Acceptance Criteria

1. WHEN a snapshot is written THEN it SHALL contain only the fields the shared
   card renders, enumerated in the design as a type — not the whole `Goal` or
   `UserStats` object.
2. WHEN a stored snapshot is read THEN it SHALL be parsed against a schema
   rather than cast, and a snapshot that does not parse — one written by an
   older shape of the app — SHALL render the same "not updated yet" state as a
   missing one, never an exception on a public page.
3. WHEN the shared page renders THEN it SHALL NOT expose the runner's email,
   Trenara user id, last name, date of birth, location, subscription state, or
   any other account field.
4. WHEN the shared page renders THEN it SHALL NOT expose the training schedule,
   individual sessions, chat, news, shoes or nutrition.
5. WHEN a token is presented for a link that does not exist or has been revoked
   THEN the system SHALL answer 404 with the same page in both cases, so that
   a revoked token is indistinguishable from one that never existed.
6. WHEN the shared page is served THEN it SHALL carry `noindex` as both a meta
   tag and an `X-Robots-Tag` header, and the app's `robots.txt` SHALL disallow
   `/s/`.
7. WHEN the link is pasted into a chat application THEN its Open Graph preview
   SHALL read as a neutral "Trainara — a shared running goal" with no name, no
   target and no times, so that forwarding a link does not spill the numbers
   into a group chat before anyone opens it.

### Requirement 5 — Keeping control of a link

**User Story:** As a runner, I want to be able to cut a link off, so that
sharing is a decision I can take back.

#### Acceptance Criteria

1. WHEN a link exists THEN the share dialog SHALL offer "Revoke" and
   "Create new link".
2. WHEN the runner revokes THEN the link SHALL stop working immediately and the
   share control SHALL return to its create state.
3. WHEN the runner creates a new link for a goal that already has one THEN the
   old token SHALL stop working and the new one SHALL serve the same goal.
4. WHEN the runner revokes THEN the system SHALL clear the stored snapshot as
   well as marking the row revoked, so that revoking removes the published copy
   and not merely the door to it. The row itself MAY be kept, so the goal can be
   shared again later, and the page SHALL answer 404 as in 4.5.
5. WHEN a link is revoked THEN a subsequent snapshot refresh SHALL NOT write to
   it, so a revoked link cannot refill with fresh data on the owner's next page
   load.
6. WHEN the runner sets a goal in Trenara that is not the goal a link was made
   for THEN that link SHALL keep serving its own goal's last snapshot, and
   SHALL NOT begin serving the new goal.
7. WHEN a shared goal's end date has passed THEN the page SHALL read as
   completed — the existing card already does this, and no expiry job, cron or
   scheduled cleanup SHALL be introduced for it.

### Requirement 6 — Cost and abuse

**User Story:** As the maintainer, I want the feature to stay inside the free
Supabase tier and to not become a way to attack the app.

#### Acceptance Criteria

1. WHEN links accumulate THEN storage SHALL be one row per shared goal,
   overwritten in place — never one row per snapshot and never one row per
   view.
2. WHEN a shared page is viewed THEN the system SHALL make no write of any
   kind, so a link that gets passed around costs reads only.
3. WHEN a shared page is viewed THEN the system SHALL make no Trenara request.
4. WHEN tokens are looked up THEN the query SHALL be answered by a unique index
   on the token.
5. WHEN requests for `/s/*` arrive faster than a per-IP limit THEN the system
   SHALL refuse with 429, bounding both token guessing and read volume.
6. WHEN a runner creates or revokes links THEN the write SHALL be subject to
   the existing per-user storage write limiter.
7. WHEN rows are inserted THEN a database-level cap per user SHALL bound how
   many share rows one account can create, in the manner of the existing
   `goal_history` and `chat_read_state` caps.

### Requirement 7 — Fitting the codebase as it is

**User Story:** As the maintainer, I want this feature to follow the
invariants the rest of the app already holds to.

#### Acceptance Criteria

1. WHEN authentication is resolved THEN it SHALL remain `hooks.server.ts` and
   `requireUser(locals)` — the public route SHALL be public by virtue of
   sitting outside `/api` and `/(app)`, with no new guard, no route-level
   `if (!locals.user)`, and no change to `handleGuard`'s rules.
2. WHEN a snapshot is written THEN its contents SHALL be read server-side from
   Trenara, never accepted from a request body.
3. WHEN a share row is mutated THEN the request SHALL use a method that is not
   GET.
4. WHEN a DAO query runs THEN it SHALL carry `.eq('user_id', …)`, except the
   single public read by token, which is scoped by the token's own unique index
   and SHALL be a distinct, clearly named method.
5. WHEN the table is created THEN RLS SHALL be enabled with no policies and
   grants revoked from `anon` and `authenticated`, matching the other four
   tables.
6. WHEN the shared card renders THEN it SHALL reuse `goal-card.svelte` rather
   than a copy of its forecast, trend and gap derivations.
7. WHEN the shared card renders THEN it SHALL make no client-side fetch and no
   `POST` — in particular it SHALL NOT call `/api/v1/prediction-history` or
   `/api/v1/goal-history`, both of which would 401 for a visitor.
8. WHEN the share dialog needs to know whether a link exists THEN that state
   SHALL arrive from `/goal`'s `load`, not from a fetch on mount, since a
   `load` can do it.
9. WHEN a query is written against the new table THEN it SHALL follow the
   conditional-`UPDATE`-then-`INSERT` pattern the read-state tables use rather
   than a read, a comparison in JavaScript, and a write.
10. WHEN the work is done THEN unit tests SHALL cover the DAO, the snapshot
    projection, the staleness wording and the token generation; component tests
    SHALL cover the share dialog's states and the shared card's reduced mode;
    and a load test SHALL cover live, revoked, missing and snapshot-less tokens.
11. WHEN §3 of `agents.md` describes the security architecture THEN it SHALL be
    updated in the same commit to describe the public route.
