# Design Document

## Overview

A share link is a row in Supabase holding three things: a random token, a
projection of the goal card's inputs, and the time that projection was taken.
The owner's own page loads keep the projection current; a public route reads it
by token and renders the existing goal card against it.

Nothing else moves. There is no cron, no stored Trenara credential, no
background refresh, no per-view write, and no second copy of the forecast
logic.

```
   OWNER                                    VISITOR
   ─────                                    ───────
   GET /dashboard  ─┐                       GET /s/<token>
   GET /goal       ─┤                             │
                    │  (already fetching          │  by token, one row
                    │   goal + stats)             ▼
                    ▼                       ┌───────────────┐
              refreshSnapshot()  ─────────► │  goal_share   │
              (one UPDATE per load)         │  token        │
                                            │  snapshot     │
   POST/PUT/DELETE /api/v1/goal-share ────► │  snapshot_at  │
   (create / rotate / revoke)               └───────┬───────┘
                                                    │
                                            prediction_history
                                            (owner's rows, by goal window)
                                                    │
                                                    ▼
                                            goal-card.svelte
                                            (history supplied, no fetch)
```

## Why the snapshot, restated

Worth writing down because it is the question anyone reading this will ask
first: why not just fetch Trenara when the visitor loads the page?

Because the fetch needs the owner's access token. Serving a visitor live data
means keeping a long-lived Trenara refresh token in the database and spending
it on anonymous traffic — a stored credential for a reverse-engineered API, on
an upstream budget of roughly sixty requests a minute shared by the whole app,
driven by whoever holds a URL. A link that got passed around a running club
would log the owner out. The snapshot costs one `UPDATE` of one small row on
pages the owner was loading anyway, and it cannot be made to spend anything by
a stranger.

The price is honest and it is on the page: the numbers are as fresh as the
owner's last visit, and the page says so.

## Data model

### Table

```sql
-- One row per shared goal. Overwritten in place: the snapshot is a current
-- value, not a history — `prediction_history` is where the history lives, and
-- the shared page reads that directly.
CREATE TABLE IF NOT EXISTS goal_share (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    -- The Trenara goal id this link is for. A link is bound to one goal: when
    -- the runner starts training for something else, this link keeps serving
    -- the goal it was made for rather than silently swapping what a friend is
    -- looking at.
    goal_id INTEGER NOT NULL,
    -- 32 random bytes, base64url. Stored as it is issued rather than hashed,
    -- deliberately: the runner must be able to come back and copy the link
    -- again, which a hash makes impossible. What a leaked token grants is one
    -- read-only goal card — no account access, no write, nothing upstream —
    -- and the table is already unreachable except through the service role
    -- key (see the RLS block). A hash would be right if this were a
    -- credential; it is a capability for a page of running numbers.
    token VARCHAR(64) NOT NULL,
    -- The runner's own words for the link, optional. Bounded so the column is
    -- not a place to store a document.
    title VARCHAR(80),
    -- First name as it was when the link was made. Copied rather than joined:
    -- the public read must not touch anything else, and there is nothing else
    -- to join to — `/api/me` needs the owner's token.
    display_name VARCHAR(80),
    -- The goal card's inputs, projected. See `SharedSnapshot` below for what
    -- may appear here; the projection is the privacy boundary, so it is a
    -- named type and not `Goal`/`UserStats` passed through.
    snapshot JSONB,
    snapshot_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- One link per goal. `PUT` rotates the token on this row.
    UNIQUE (user_id, goal_id)
);

-- The public read is `WHERE token = $1`, and it is the only query a stranger
-- can cause. Unique so it is an index probe and so a token cannot be issued
-- twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_goal_share_token ON goal_share(token);

-- No index is declared for the owner's own lookups. `UNIQUE (user_id, goal_id)`
-- above already creates one, and it serves both of them: the goal page's "is
-- this goal shared?" is an equality probe on the whole key, and the row-cap
-- trigger's `COUNT(… WHERE user_id = …)` is a scan of its leading column.
-- A second index on the same pair would be paid for on every write and read
-- from never. (`prediction_history` carries exactly that redundancy — a
-- `UNIQUE (user_id, recorded_at)` and an `idx_…_user_date` over the same two
-- columns. Not repeated here.)

ALTER TABLE goal_share ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON goal_share FROM anon, authenticated;

-- The backstop the other tables carry, sized far above any plausible number of
-- goals one runner trains for.
CREATE OR REPLACE FUNCTION goal_share_row_cap() RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM goal_share WHERE user_id = NEW.user_id) >= 100 THEN
        RAISE EXCEPTION 'share link limit reached for user %', NEW.user_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS goal_share_row_cap_trigger ON goal_share;
CREATE TRIGGER goal_share_row_cap_trigger
    BEFORE INSERT ON goal_share
    FOR EACH ROW EXECUTE FUNCTION goal_share_row_cap();
```

`snapshot` and `snapshot_at` are nullable because a link is created before the
first refresh has necessarily run — the create path fills them in the same
request, but a row with neither is a state the public page must render (see
"Empty and failure states").

### The projection

This type is the whole of what a link publishes. It exists so that the answer
to "what does a friend see?" is a file rather than an argument, and so that
adding a field to it is a deliberate act with a diff.

```ts
// $lib/server/share/snapshot.ts

/**
 * The goal card's inputs, and nothing else.
 *
 * Every field here is one `goal-card.svelte` actually reads — the list was
 * taken from the component, not guessed — and everything else Trenara sends
 * about a goal, an account or a training week is deliberately absent. A
 * `Goal` carries `intermediate_goals`, `can_be_edited`, `overrule_time`; a
 * `UserStats` carries `flat_stats` and four other distances. None of it is
 * needed to draw this card, so none of it is published.
 */
export interface SharedSnapshot {
	/** Schema version, so a shape change can be recognised rather than crash. */
	v: 1;
	goal: {
		name: string;
		start_date: string;
		end_date: string;
		distance: string;
		distance_unit: string;
		distance_value: number;
		time: string;
		time_in_sec: number;
		pace: string;
	};
	best_times: {
		time_for_goal: string;
		pace_for_goal: string;
	};
	/**
	 * The plan's weeks — planned and completed kilometres. This is what the
	 * forecast is priced from (`readPlanWeeks`), and it is also the compliance
	 * record: it says which weeks were run short. Included knowingly; the
	 * forecast is the point of the page and cannot be drawn without it.
	 */
	plan_weeks: UserStats['graph_stats']['goal'];
}
```

`goal.description` is not carried. The API stopped sending it, and a free-text
field is the one place a goal could hold something personal.

The card's props are narrowed to match, which is what makes the projection
checkable rather than a promise:

```ts
// $lib/components/goal/goal-card.svelte
export type GoalCardGoal = Pick<
	Goal,
	| 'name'
	| 'start_date'
	| 'end_date'
	| 'distance'
	| 'distance_unit'
	| 'distance_value'
	| 'time'
	| 'time_in_sec'
	| 'pace'
> & { description?: string };

export type GoalCardStats = {
	best_times?: Partial<UserStats['best_times']>;
	graph_stats?: Partial<UserStats['graph_stats']>;
};
```

A full `Goal` and `UserStats` satisfy these structurally, so the dashboard and
`/goal` pass what they already pass and nothing changes for them. The snapshot
satisfies them too — and if someone later adds a field to the card, the
snapshot stops type-checking, which is the point.

## Server modules

### `$lib/server/share/token.ts`

```ts
/**
 * 32 bytes, base64url — 43 characters, 256 bits.
 *
 * From `crypto.getRandomValues`, which is the platform's CSPRNG on both the
 * Node runtime this deploys to and in tests. Not `Math.random`, which is
 * seeded predictably enough that guessing a live link becomes arithmetic.
 *
 * base64url rather than hex so the URL stays short enough to read out, and so
 * it survives being pasted into a chat client that eats punctuation.
 */
export function generateShareToken(): string;

/** Cheap shape gate before the query, so nonsense never reaches the database. */
export function isShareToken(value: string): boolean; // /^[A-Za-z0-9_-]{43}$/
```

### `$lib/server/db/goal-share.ts`

A DAO in the shape of the existing four. Every owner-scoped method carries
`.eq('user_id', …)`; the one public method is named so that its absence is
obvious.

```ts
class GoalShareDAO {
	/** The runner's link for one goal, or null. */
	getForGoal(userId: number, goalId: number): Promise<ShareRow | null>;

	/**
	 * Create the link, or rotate the token on the one that exists.
	 *
	 * `UPDATE … WHERE user_id = … AND goal_id = …` first, falling back to an
	 * `INSERT` whose unique violation means another request created the row in
	 * between — the shape `NewsReadStateDAO.advanceMark` already uses, and for
	 * the same reason: two taps on "Create link" must not race into two rows.
	 *
	 * Deliberately *not* an upsert, which is what this said first. The row-cap
	 * trigger is `BEFORE INSERT`, and Postgres fires that on the
	 * `ON CONFLICT DO UPDATE` path too — so at the cap, upserting would refuse
	 * to rotate a token on a row that already exists, which is a regenerate
	 * failing for the reason "you have too many links". Update-then-insert
	 * only reaches the trigger when a row is genuinely being added, which is
	 * the only case the cap is about.
	 *
	 * Rotating keeps the row, so a regenerated link starts life with the
	 * snapshot the old one had rather than blank, and the old token is dead
	 * the moment the column changes.
	 */
	issue(userId: number, goalId: number, fields: IssueFields): Promise<ShareRow>;

	/**
	 * Set `revoked_at` and null out `snapshot` in the same statement.
	 *
	 * Clearing the copy, not just the door. A revoke that leaves the published
	 * snapshot sitting in the table means the runner's "stop sharing this"
	 * left the shared data where it was — true but invisible, and not what
	 * they asked for. The row survives so the goal can be shared again later,
	 * at which point the next refresh repopulates it.
	 *
	 * Returns whether a row was actually live to revoke.
	 */
	revoke(userId: number, goalId: number): Promise<{ revoked: boolean }>;

	/**
	 * Write the snapshot for a live link.
	 *
	 * One `UPDATE … WHERE user_id = … AND goal_id = … AND revoked_at IS NULL`.
	 * No staleness condition, which is a reversal — this design carried a
	 * fifteen-minute throttle, and the throttle was the bug. See "One
	 * consistency unit" below.
	 *
	 * `revoked_at IS NULL` stays: a revoked link must not quietly refill with
	 * fresh data on the owner's next page load. A row that does not match is
	 * the ordinary case — most runners share nothing — and `{ written: false }`
	 * says so without it being a failure.
	 */
	refreshSnapshot(
		userId: number,
		goalId: number,
		snapshot: SharedSnapshot
	): Promise<{ written: boolean }>;

	/**
	 * The public read. The only query a visitor can cause, and the only one in
	 * this file without a `user_id` filter — scoped instead by the token's own
	 * unique index, which is the whole capability.
	 *
	 * Returns null for a token that does not exist and for a revoked one
	 * alike: the caller must not be able to tell those apart, or the route
	 * becomes an oracle for which tokens were once real.
	 */
	getLiveByToken(token: string): Promise<PublicShareRow | null>;
}
```

`getLiveByToken` is `.select(…).eq('token', token).is('revoked_at', null).maybeSingle()`.
`maybeSingle`, not `single`: `single` raises PGRST116 when nothing matches, and
nothing matching is the ordinary case here — every mistyped or revoked token.
Through `storageFailed` that would surface as a 503 "your history could not be
loaded", so the most common outcome of the most public route in the app would
report itself as the database being down.

Columns are listed explicitly — `token, title, display_name, snapshot,
snapshot_at, user_id, goal_id` — rather than `*`. `user_id` is needed to read
the prediction history and never leaves the server.

### `$lib/server/share/refresh.ts`

```ts
/**
 * Keep a shared goal's snapshot current, from data the caller already has.
 *
 * Takes the goal and stats rather than fetching them: both callers are page
 * loads that just fetched them, and a second fetch here would spend the
 * upstream budget to write a row.
 *
 * Best-effort in the way `keepHistory` is best-effort — it never rejects, and
 * it must never fail the owner's page. A runner whose share row will not write
 * still gets their dashboard.
 */
export async function refreshShareSnapshot(
	userId: number,
	goal: Goal | null,
	stats: UserStats | null
): Promise<void>;
```

### One consistency unit

There is no throttle, and removing it is a correction to this design rather
than a simplification of it.

The shared page renders from two places: the `snapshot` column supplies the
goal, the current prediction and the plan weeks, while the prediction _history_
is read live from `prediction_history`. The forecast then mixes them — it
anchors on `best_times.time_for_goal` from the snapshot and prices the plan
from `history.forGoal` samples out of the table. Two sources feeding one
calculation is only safe while they are written together.

A fifteen-minute throttle is exactly what breaks that. `keepHistory` records
today's prediction on every owner page load; the throttled snapshot wrote on
some of them. So a prediction that moved — a session rated at lunchtime — could
land in the history table while the snapshot still carried the morning's
figure, and the forecast would anchor "today" at a number the curve beside it
has already left behind. A line that starts off the end of its own history is
the sort of wrongness nobody can explain from the page.

Both writes ride the same request instead. `refreshShareSnapshot` runs
wherever `keepHistory` runs, from the same `stats` object, so the snapshot and
the history row are written from one reading of Trenara and cannot disagree by
more than a failed write. `storeIfChanged` is already unconditional-per-load
and decides internally whether there is anything to store; the snapshot now
matches it.

What the throttle was buying: one `UPDATE` of one small row per owner page
load. Against a free tier bounded by storage and bandwidth rather than write
count, that is not a cost worth a correctness hazard. It also deletes the
`.or('snapshot_at.is.null,…')` subtlety the previous revision needed, since
there is no longer a comparison to get wrong.

Wiring:

- `keepHistory` in `$lib/server/history/record.ts` already runs on the
  dashboard load with the goal and the stats in hand. `refreshShareSnapshot`
  joins it there, in the same `Promise.all`, costing no wall-clock time.
- `/goal`'s load streams `goal` and `userStats` as promises. The refresh hangs
  off those promises rather than being awaited, so the page still streams.

### `/api/v1/goal-share/+server.ts`

Inside `/api`, so `handleGuard` authenticates it and rate-limits it already,
and `requireUser(locals)` narrows the runner.

| Method   | Does                                              | Notes                                                                                          |
| -------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `POST`   | Create if none is live, body `{ title?: string }` | Idempotent; returns the existing link untouched. Writes the first snapshot in the same request |
| `PUT`    | Rotate the token on the live link                 | The explicit "Create new link", never reachable by repeating a `POST`                          |
| `DELETE` | Revoke                                            | Sets `revoked_at` and clears the snapshot                                                      |

All three take the `storageWrites` limiter.

Splitting create from rotate is a correction. This design had one `POST`
meaning "create or regenerate", which makes the mutation non-idempotent in the
one way that actually hurts: a double-tap on "Create link" — or a retry after a
flaky connection — issues a second token and silently kills the one just handed
out. The runner would be looking at a URL they had already pasted into a
message, now dead, with nothing on screen to say so. Rotation is a thing a
runner should have to ask for, so it gets its own method, and `POST` becomes
safe to repeat.

There is no `GET`, which is a correction to this design's first draft. The
dialog's opening state — does a link exist, and what is its URL — was going to
be an `onMount` fetch, and §5 of `agents.md` says plainly: no `onMount` for
data fetching where a `load` can do it. `/goal`'s load already runs
server-side with the runner resolved, so it streams `share` alongside `goal`
and `userStats`, and the dialog is handed its state as a prop. That removes a
round trip, removes the dialog's whole "unknown" state, and leaves the
endpoint holding only mutations — every one of them a method that is not GET,
per the CSRF invariant.

After a create or revoke the dialog calls `invalidateAll()`, so the new state
comes back through the same load that seeded it rather than through a second
code path that could disagree with it.

The goal id is never taken from the request. `POST` reads `trainingApi.getGoal(cookies)`
— cached, so it is usually free — and uses that id, per the invariant that the
server does not store what the client composed. `title` is the one thing the
runner authors; it is trimmed, length-capped at 80, and rendered as text by
Svelte's own escaping (no `@html` anywhere on the public page).

The response carries the absolute URL, built from the request's own origin
rather than an environment variable, so preview deployments hand out links that
work on the preview.

## The public route

`src/routes/s/[token]/` — outside `/api` and outside `(app)`, which is exactly
why it needs no change to `handleGuard`: that hook only gates those two
prefixes. Worth a comment at the route, because "this route is public" is
otherwise a property of a file's location that nothing states.

The path is `/s/` rather than `/goal/shared/`: it is typed out loud sometimes,
and `/goal/*` is inside the authenticated area conceptually even though the
group is what enforces it. Keeping the public tree at its own root removes the
chance of a future `(app)`-adjacent route accidentally inheriting it.

### `+page.server.ts`

```
1. Rate-limit by IP (`getClientAddress()`, `shareViews`, 60/min). 429 if over.
2. Shape-check the token; a miss is a 404 without a query.
3. `getLiveByToken`. Null → 404.
4. Parse `snapshot` with Zod. A parse failure is the "not updated yet" state.
5. Read the owner's `prediction_history` from `snapshot.goal.start_date`,
   limit 200 — the same window and limit the owner's card uses.
6. Return { title, name, goal, stats, snapshotAt, history }.
```

Step 4 is the one that was missing from this design's first draft. The
snapshot is a JSONB column, so it comes back as `unknown` and the tempting
thing is to cast it — but it was written by whichever version of this app was
deployed when the owner last opened the dashboard, and it will be read by
whichever version is deployed when a friend opens the link. Those are not the
same version, which is what the `v` field is for and what nothing was checking.
A cast makes a shape change a `TypeError` inside a component on a public page;
a parse makes it the empty state, which is already drawn. So:
`src/lib/schemas/share.ts` holds a Zod schema for `SharedSnapshot` — the app
already validates upstream shapes with `expectObject`, and its own storage
crossing a deploy boundary deserves no less.

Step 1 uses `getClientAddress()`, as the login action already does — not a
hand-read `x-forwarded-for`, which is spoofable where the platform's own
resolution is not.

Step 5 is the only place in the app where an anonymous request causes an
owner-scoped read. It goes through the existing
`predictionHistoryDAO.getUserPredictionHistory`, so it carries `.eq('user_id',
…)` like everything else — and the id it filters on comes from the share row
the token resolved to, never from anything in the request. Worth a comment at
the call site: the token is the authorisation, and the row is what says whose
history it authorises.

`prerender = false`, `ssr = true`, `csr` left on so the chart's interactivity
(tooltips) works. The load is entirely server-side: the visitor's browser
makes no API call, which is the requirement that keeps the page working with no
token and no session.

`setHeaders({ 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer', 'cache-control': 'public, max-age=60' })`.

`referrer-policy` was missing, and it is the one mitigation a capability URL
actually needs. The token is in the path, so the whole URL travels in the
`Referer` header of anything the page links to or loads — the footer's link
back to the app today, and whatever gets added later. `no-referrer` stops the
link reaching a destination it was never given to. It is belt and braces with
the CSP, which already forbids external subresources, and it costs nothing.

The rest of a capability URL's exposure is inherent and accepted: the token
sits in browser history, in the recipient's chat log, and in any screenshot of
the address bar. That is what "anyone with the link" means, and revocation is
the answer to it.
A minute of caching absorbs the refresh-hammering case without ever showing a
number older than the snapshot already is. `public` is safe here even though
the content is personal: the cache key is the full path, the token is in the
path, and the response never varies by cookie or header — the page reads no
session and renders identically for the owner and for a stranger.

### Empty and failure states

Per §4 of `agents.md`, absence must not stand for two things. The route has
four outcomes and the page draws each:

| Outcome                                    | What the visitor sees                                                                                                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Live link with a snapshot                  | The goal card                                                                                                                                                                                                                  |
| Live link, snapshot missing or unparseable | "This goal hasn't been updated yet — check back once <name> next opens Trainara." Not an error: it is a link created seconds ago, one whose owner has not been back since, or a snapshot written by an older shape of the app. |
| Revoked or unknown token                   | 404: "This link is no longer available." Identical text for both.                                                                                                                                                              |
| Storage failure                            | The existing `STORAGE_READ_MESSAGE`, through `fromStorage`                                                                                                                                                                     |

There is no client-side loading state on this page at all, because there is no
client-side fetch — the one place in the app where rendering nothing is
honest, and worth saying so in a comment so it does not read as an omission.

### `+page.svelte`

A slim shell, not the app shell: title, name, the "Updated …" line, the card,
and a footer. No navbar, no links into `(app)`, and the footer carries the
unofficial-client disclaimer the README already words, plus one link to the
app's marketing-free landing (`/`) for a friend who wants to know what this is.

`<svelte:head>` carries the neutral Open Graph tags:

```html
<title>Trainara — a shared running goal</title>
<meta name="robots" content="noindex, nofollow" />
<meta property="og:title" content="Trainara — a shared running goal" />
<meta property="og:description" content="Someone shared their training goal with you." />
<meta name="og:image" content="/icons/icon-512x512.png" />
```

No name, no target, no times: a link forwarded into a group chat should not
render the numbers in the preview before anyone has decided to open it.

`static/robots.txt` is added — the app has none — with `Disallow: /s/`.

## Reusing the goal card

The card is roughly nine hundred lines, of which the forecast, the trend, the
gap, the shortfall wording and the basis line are the substance. Copying them
into a public variant would mean two implementations of the same claim about
the same runner, drifting apart from the first bug fix. So the card is reused,
with three additive props:

```ts
let {
	goal,
	userStats,
	collapsible,
	expanded,
	ontoggle,
	bodyId,

	/**
	 * The prediction history to plot. Required — the card does not fetch it.
	 *
	 * This is the whole of what made a shared card possible, and it is not a
	 * mode: the card fetched its own history on mount, and all three of the
	 * calls it made there (`GET` history, `POST` a prediction, `POST` an
	 * archive) are authenticated and would 401 for a visitor. An earlier
	 * revision of this design made the prop optional and branched on it, which
	 * gave one component two behaviours distinguished by whether an argument
	 * was passed. Handing the data in always is simpler and removes the branch.
	 */
	history,

	/**
	 * Which graphs the picker offers. All three by default; the shared page
	 * passes `['prediction']`, and with one view the picker collapses to its
	 * title and the arrows are not rendered.
	 */
	views = ['prediction', 'week', 'goal']
}: Props = $props();
```

`onMount` goes entirely, which is the part worth arguing for, because it also
changes the owner's page.

The card currently fetches its own history and fires two best-effort writes on
mount. Two of those three are already redundant: the dashboard's load records
the prediction and archives the goal server-side, and §5 of `agents.md` says no
`onMount` for data fetching where a `load` can do it — so `/goal` has been
carrying a rule violation and a duplicated write since the recording moved to
the server. Moving the history read and the two writes into `/goal`'s load
fixes that, and leaves the card a pure function of its props.

Which is what makes the shared page not a special case. There is no `readOnly`
flag, no optional prop, no `if` deciding which of two components this is: both
callers hand the card its data, and the only difference between them is where
the data came from. A mode flag would have been the seed of exactly the drift
this reuse exists to avoid.

The cost is honest: this touches a working page and its tests, and it is the
one step in the plan that can regress something a runner uses today. It is
sequenced before the public route for that reason — if it breaks anything, it
breaks in isolation and not while a new feature is also in flight.

Everything else — `isPast` giving the completed-goal reading after race day,
`weeksRemaining`, the progress bar, `splitByGoalDistance` dropping a previous
goal's readings — already behaves correctly against snapshot data, because it
only ever read the props.

The distance charts still enter the public page's bundle through the card's
static imports. Left alone: they are small, and a dynamic import to shave them
is the sort of change that should follow a look at the build output rather than
precede one.

### The share control

`goal-card-share.svelte`, rendered into the card header on `/goal` only —
passed in as a snippet so the card itself gains no knowledge of sharing, and
the dashboard's copy of the card is unaffected.

Two states, not three: _none_ (title field + "Create link") and _live_ (URL,
copy, "Create new link", "Revoke"). There is no _unknown_ state, because the
share row arrives from `/goal`'s load rather than from a fetch on mount — see
the endpoint section. The dialog follows the existing modals in
`$lib/components/modals`.

The mutations still have the three outcomes every client-side call has, and
they are drawn: the button holds a pending state while a create or revoke is
in flight (disabled, spinner inside a `role="status"` wrapper with an `sr-only`
sentence, tagged `data-testid`), and a failure says so in place rather than
leaving the dialog looking untouched. What the loading rules in §4 of
`agents.md` forbid is a component that draws only the good outcome; a dialog
whose _data_ came from a load simply has fewer outcomes to draw.

## Rate limiting

One addition to `$lib/server/security/rate-limit.ts`:

```ts
/**
 * Views of a shared link, by IP.
 *
 * A token is 256 bits, so this is not what stops guessing — arithmetic does.
 * It bounds the read volume one visitor can put on Supabase, which on a free
 * tier is the resource actually worth protecting, and it makes a scripted
 * sweep pointless rather than merely futile.
 *
 * Per instance and in memory, with the same honest caveat as the others.
 */
export const shareViews = new RateLimiter({ limit: 60, windowMs: 60_000 });
```

Creates and revokes go through the existing `storageWrites`.

## Testing

| File                         | Covers                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `token.test.ts`              | Length, alphabet, distinctness across many draws, `isShareToken` accepting an issued token and rejecting shape variants                                                                                                                                                                                                                                                                                              |
| `goal-share.test.ts`         | Every DAO method against the mocked Supabase client; `getLiveByToken` using `maybeSingle` and returning null for revoked and for missing alike; `refreshSnapshot` writing past the cutoff **and** when `snapshot_at` is null, and never on a revoked row; `issue` rotating in place rather than inserting when a row exists; `revoke` clearing the snapshot; the `user_id` filter present on every owner-scoped call |
| `snapshot.test.ts`           | The projection carries exactly the listed fields and drops the rest — asserted by comparing key sets against a full fixture, so a new upstream field cannot silently ride along; the Zod schema accepts what `projectSnapshot` produces (round trip) and rejects a `v: 2` and a truncated blob                                                                                                                       |
| `refresh.test.ts`            | Throttle honoured; null goal or null stats writes nothing; a storage failure resolves rather than rejects                                                                                                                                                                                                                                                                                                            |
| `goal-share/+server.test.ts` | 401 without a session (through the hook), goal id taken from Trenara and not the body, title trimmed and capped, revoke idempotent, limiter refusals, and no `GET` handler exported                                                                                                                                                                                                                                  |
| `share-page.test.ts`         | Live token renders; revoked and unknown both 404 with identical output; a live token with no snapshot renders the waiting state; an unparseable snapshot renders the same state rather than throwing; the history is read for the share row's `user_id` and not for anything in the request; the `noindex` header is set                                                                                             |
| `goal-card.shared.test.ts`   | With `history` supplied: no `fetch` occurs at all; with `views: ['prediction']`: no picker arrows, title still present, distance graphs absent                                                                                                                                                                                                                                                                       |
| `goal-card-share.test.ts`    | Both dialog states from a prop with no fetch on mount, the copy confirmation, and the create/revoke calls' pending and failed outcomes                                                                                                                                                                                                                                                                               |

Coverage thresholds in `vitest.config.ts` are a gate in CI; this feature adds
enough surface that they should be re-checked after, and raised if the number
moved up.

## Evolving the snapshot

The snapshot is a stored projection, which means every deploy reads rows
written by earlier deploys. The `v` field exists for that, but a version tag
only helps if something is prepared to act on it, so the rule is written down
rather than left to whoever makes the change:

**Never ship a snapshot shape that the reader cannot understand from the
previous one.** A strict schema that rejects `v: 1` the day `v: 2` ships would
blank every shared page in existence until each owner happened to open the app
again — a silent, staggered outage measured in days, caused by a deploy that
looked like a refactor. So the Zod schema is a union over the versions still in
the wild, and `v: 1` is upgraded in code on read. A version may only be dropped
once nothing can still be holding it.

Adding an optional field needs no version bump. Removing one, renaming one, or
changing what one means does.

## Known costs

Stated in the manner of §8 of `agents.md`, so nobody plans around capacity this
does not have.

- **One extra Supabase `UPDATE` on every owner page load**, including for the
  large majority of runners who have never shared anything and whose statement
  matches no row. It rides inside the existing `Promise.all`, so it costs no
  wall-clock time, but it is a fifth round trip where there were four. Fixing
  it properly means knowing whether a share exists without asking, which is a
  per-instance cache — the same trade the read cache already makes, and not
  worth making before the round trip is measured as a problem.
- **The public route costs two reads per uncached view** — the share row and
  the history window — bounded by the 60/min per-IP limiter and the
  one-minute cache header.
- **A share row is a few kilobytes** and there is at most one per goal, capped
  at a hundred per runner. Storage is not the constraint here; the row count
  cannot outgrow the goals a person trains for.
- **There is no data retention or deletion path**, and this feature does not
  add one. A revoked link keeps its row, with the runner's first name on it,
  until someone deletes it by hand. That is true of every table in this app
  already; it is worth saying once rather than pretending this feature is the
  exception.

## What this design does not do

Stated so that nobody has to reverse-engineer the absence:

- **No background refresh.** A snapshot is only as fresh as the owner's last
  visit. Adding a cron would mean storing a Trenara refresh token, which is
  the one thing this design is built to avoid.
- **No view counts.** Counting views means a write per view, which is the
  opposite of the storage shape chosen here. If it is ever wanted, it belongs
  in a separate table with a coarse bucket, not as a column on this row.
- **No generated preview image.** The preview is deliberately neutral, so
  there is nothing to render.
- **No multiple links per goal.** One link, revocable and regenerable. Several
  audiences with independent revocation is a real want, and the schema admits
  it later — drop the `(user_id, goal_id)` uniqueness and add a label — but it
  is not this.
- **No expiry.** A finished goal reads as finished through the card's existing
  `isPast` branch, which costs nothing and needs no scheduled job.
