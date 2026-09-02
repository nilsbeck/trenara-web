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
              (throttled UPDATE)            │  token        │
                                            │  snapshot     │
   POST/DELETE /api/v1/goal-share ────────► │  snapshot_at  │
   (create / revoke / regenerate)           └───────┬───────┘
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
would log the owner out. The snapshot costs one throttled `UPDATE` on pages the
owner was loading anyway, and it cannot be made to spend anything by a stranger.

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
    -- One link per goal. `Create new link` rotates the token on this row.
    UNIQUE (user_id, goal_id)
);

-- The public read is `WHERE token = $1`, and it is the only query a stranger
-- can cause. Unique so it is an index probe and so a token cannot be issued
-- twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_goal_share_token ON goal_share(token);

-- The owner's own lookups: "is this goal shared?" on the goal page, and the
-- throttled refresh.
CREATE INDEX IF NOT EXISTS idx_goal_share_user ON goal_share(user_id, goal_id);

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
	 * Upsert on `(user_id, goal_id)` — one statement, so two taps on "Create
	 * link" cannot race into two rows or into a unique violation. Rotating
	 * keeps the row, so a regenerated link starts life with the snapshot the
	 * old one had rather than blank.
	 */
	issue(userId: number, goalId: number, fields: IssueFields): Promise<ShareRow>;

	/** Set `revoked_at`. Returns whether a row was actually live to revoke. */
	revoke(userId: number, goalId: number): Promise<{ revoked: boolean }>;

	/**
	 * Write the snapshot, but only if the stored one is older than `staleAfter`.
	 *
	 * One conditional `UPDATE … WHERE snapshot_at < $cutoff OR snapshot_at IS
	 * NULL`, not a read followed by a decision followed by a write: two of the
	 * owner's own page loads land together often (dashboard and goal page, or
	 * two tabs), and the read-compare-write shape is the one the read-state
	 * tables were already burned by.
	 */
	refreshSnapshot(
		userId: number,
		goalId: number,
		snapshot: SharedSnapshot,
		staleAfter: number
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

`getLiveByToken` selects columns explicitly — `token, title, display_name,
snapshot, snapshot_at, user_id, goal_id` — rather than `*`. `user_id` is needed
to read the prediction history and never leaves the server.

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

The throttle is fifteen minutes. Reasoning: the underlying numbers move roughly
once a day (a prediction is recorded per day, a plan week per week), so
fifteen minutes is far finer than the data and still collapses a session of
clicking around the app into a single write. It is a named constant next to the
function that uses it.

Wiring:

- `keepHistory` in `$lib/server/history/record.ts` already runs on the
  dashboard load with the goal and the stats in hand. `refreshShareSnapshot`
  joins it there, in the same `Promise.all`, costing no wall-clock time.
- `/goal`'s load streams `goal` and `userStats` as promises. The refresh hangs
  off those promises rather than being awaited, so the page still streams.

### `/api/v1/goal-share/+server.ts`

Inside `/api`, so `handleGuard` authenticates it and rate-limits it already,
and `requireUser(locals)` narrows the runner.

| Method   | Does                                                         | Notes                                                                  |
| -------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `GET`    | The link for the runner's current goal, or `{ share: null }` | Feeds the share dialog's opening state                                 |
| `POST`   | Create or regenerate, body `{ title?: string }`              | `storageWrites` limiter; writes the first snapshot in the same request |
| `DELETE` | Revoke                                                       | `storageWrites` limiter                                                |

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
1. Rate-limit by IP (`shareViews`, 60/min). 429 if over.
2. Shape-check the token; a miss is a 404 without a query.
3. `getLiveByToken`. Null → 404.
4. Read the owner's `prediction_history` from `snapshot.goal.start_date`,
   limit 200 — the same window and limit the owner's card uses.
5. Return { title, name, goal, stats, snapshotAt, history }.
```

`prerender = false`, `ssr = true`, `csr` left on so the chart's interactivity
(tooltips) works. The load is entirely server-side: the visitor's browser
makes no API call, which is the requirement that keeps the page working with no
token and no session.

`setHeaders({ 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'public, max-age=60' })`.
A minute of caching absorbs the refresh-hammering case without ever showing a
number older than the snapshot already is.

### Empty and failure states

Per §4 of `agents.md`, absence must not stand for two things. The route has
four outcomes and the page draws each:

| Outcome                           | What the visitor sees                                                                                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live link with a snapshot         | The goal card                                                                                                                                                                 |
| Live link, snapshot never written | "This goal hasn't been updated yet — check back once <name> next opens Trainara." Not an error: it is a link created seconds ago, or one whose owner has not been back since. |
| Revoked or unknown token          | 404: "This link is no longer available." Identical text for both.                                                                                                             |
| Storage failure                   | The existing `STORAGE_READ_MESSAGE`, through `fromStorage`                                                                                                                    |

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
	 * The prediction history, when the caller already has it.
	 *
	 * Supplied → the card neither fetches the history nor posts to record a
	 * new prediction nor archives the goal. That is what makes it renderable
	 * for a visitor: all three of those calls are authenticated, and all three
	 * would 401. It is also why this is one prop rather than a `readOnly`
	 * flag — the flag would have to be remembered alongside the data, and the
	 * data's presence already says everything the flag would.
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

`onMount` becomes conditional on `history === undefined`. Everything else —
`isPast` giving the completed-goal reading after race day, `weeksRemaining`,
the progress bar, `splitByGoalDistance` dropping a previous goal's readings —
already behaves correctly against snapshot data, because it only ever read the
props.

The distance charts still enter the public page's bundle through the card's
static imports. Left alone: they are small, and a dynamic import to shave them
is the sort of change that should follow a look at the build output rather than
precede one.

### The share control

`goal-card-share.svelte`, rendered into the card header on `/goal` only —
passed in as a snippet so the card itself gains no knowledge of sharing, and
the dashboard's copy of the card is unaffected.

States: _unknown_ (fetching, spinner with an `sr-only` sentence, flag starting
`true` per the loading rules) → _none_ (title field + "Create link") → _live_
(URL, copy, "Create new link", "Revoke"). The dialog follows the existing
modals in `$lib/components/modals`.

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

| File                         | Covers                                                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `token.test.ts`              | Length, alphabet, distinctness across many draws, `isShareToken` accepting an issued token and rejecting shape variants                                                                                                   |
| `goal-share.test.ts`         | Every DAO method against the mocked Supabase client; `getLiveByToken` returning null for revoked and for missing; `refreshSnapshot` writing only past the cutoff; the `user_id` filter present on every owner-scoped call |
| `snapshot.test.ts`           | The projection carries exactly the listed fields and drops the rest — asserted by comparing key sets against a full fixture, so a new upstream field cannot silently ride along                                           |
| `refresh.test.ts`            | Throttle honoured; null goal or null stats writes nothing; a storage failure resolves rather than rejects                                                                                                                 |
| `goal-share/+server.test.ts` | 401 without a session (through the hook), goal id taken from Trenara and not the body, title trimmed and capped, revoke idempotent, limiter refusals                                                                      |
| `share-page.test.ts`         | Live token renders; revoked and unknown both 404 with identical output; a live token with no snapshot renders the waiting state; the `noindex` header is set                                                              |
| `goal-card.shared.test.ts`   | With `history` supplied: no `fetch` occurs at all; with `views: ['prediction']`: no picker arrows, title still present, distance graphs absent                                                                            |
| `goal-card-share.test.ts`    | The three dialog states, the copy confirmation, and the fetch's pending and failed outcomes                                                                                                                               |

Coverage thresholds in `vitest.config.ts` are a gate in CI; this feature adds
enough surface that they should be re-checked after, and raised if the number
moved up.

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
