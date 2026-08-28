# Subscription gating

Design for matching the Trenara app's paid-feature gating in this client. Nothing
here is implemented yet — this is the plan an implementation should follow.

The app sells three tiers. **Basic** is the floor, **Peak** adds plan editing,
**Pro** is everything. Today this client hands every feature to every account,
which means a Basic subscriber gets Pro behaviour by using the web app instead of
the phone. The goal is parity: the same ten features locked behind the same two
lines, decided by the profile response the client already fetches.

## 1. What is gated

| Feature key        | Min tier | Where the runner meets it                                                                         | Server route                                      |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `terrain`          | pro      | `terrain` setting in `sessionSettings()` → chip on `setup-rail`, section in `session-setup-sheet` | `POST /api/v1/training/[id]/condition`            |
| `rpe`              | pro      | `rate-training-inline.svelte`, `give-feedback-modal.svelte`                                       | `PUT /api/v1/feedback`                            |
| `strength-tab`     | pro      | `Tab.Strength` in `calendar-details.svelte`                                                       | — (rides the week payload)                        |
| `nutrition-tab`    | pro      | `Tab.Nutrition` in `calendar-details.svelte`                                                      | `GET /api/v1/nutrition`                           |
| `distance-week`    | pro      | `Distance This Week` in `GRAPH_VIEWS`, `goal-card.svelte`                                         | — (rides `userStats`)                             |
| `distance-by-week` | pro      | `Distance By Week` in `GRAPH_VIEWS`, `goal-card.svelte`                                           | — (rides `userStats`)                             |
| `training-load`    | pro      | `trainingLoad(entry)` readout in `training-details.svelte`                                        | — (rides the entry)                               |
| `move-session`     | peak     | move-date control → `change-date-modal.svelte`                                                    | `PUT /api/v1/training/move`                       |
| `delete-session`   | peak     | `canDelete` branch in `training-details.svelte`                                                   | `DELETE /api/v1/training/delete`                  |
| `week-overview`    | peak     | `WeekOverview` rings in `(app)/+layout.svelte`                                                    | `loadWeekProgress()` in `(app)/+layout.server.ts` |

Everything else — the calendar, session detail, shoe, cool-down, intensity and
distance fine-tuning, pacing plan, treadmill mode, chat, news, predictions,
goal — stays on Basic.

Three of the ten need no fetch to gate: strength, the two distance graphs and the
training-load readout are already in payloads the page has for other reasons.
Gating them is presentation only. `week-overview` is the opposite — it costs two
API calls per page load (`getSchedule` + `getUserStats`), so a Basic account
should skip `loadWeekProgress` entirely rather than fetch and hide.

## 2. Reading the tier off the profile

`GET /api/me` (`userApi.getCurrentUser`, typed as `User`) already carries the
subscription block:

```jsonc
"has_premium": true,
"premium_type": "pro",
"premium_until": 1808761078,      // unix seconds
"premium_platform": "b2b",
"premium_auto_renew": false,
"premium_trial": false,
"has_right_on_free_trial": false,
"has_expired_trial": false,
"has_nutritional_coach": true,
"strength_calibrated": false
```

**`premium_type` is the tier.** The one capture we have says `"pro"`. The strings
Basic and Peak send are unknown — see §8.

**`is_ultimate` / `is_starter` are not the tier.** `docs/backend-api.md` records
that they describe the training scheme the runner is on (they match
`training_scheme_type` on the goal), not what was paid for. Nothing may key off
them. This trap is worth a comment in the resolver, because the names read
exactly like a payment tier and an implementation will reach for them.

### Resolution order

```
1. has_premium === false                          → basic
2. premium_until in the past                      → basic (expired, whatever the type says)
3. TIER_BY_PREMIUM_TYPE[premium_type]             → that tier
4. premium_type is present but unrecognised       → pro  (fail open, see below)
5. no profile yet                                 → unknown
```

Step 4 fails **open** on purpose. This is a personal client for the runner's own
account, Trenara's backend enforces its own rules on every write, and the cost of
the two failure modes is not symmetric: showing a Basic runner a feature their
backend then refuses is a bad error message, while hiding the nutrition tab from
a paying Pro runner because Trenara renamed a string is the app losing something
they bought. Every unrecognised value should surface on the profile screen (§8)
so it gets mapped rather than silently tolerated.

Step 5 — `unknown` — is a real state, not a synonym for Basic. The profile is
streamed, so between first paint and the promise resolving the client does not
know the tier. Rendering a lock in that gap and then removing it is worse than
rendering nothing, so gates render nothing while the tier is unknown. And when
the profile fetch _fails_ rather than being slow, unknown resolves to granted,
not to Basic — see §6.

### Explicit flags beat the tier

Where the profile carries a capability flag for the same thing, the flag wins and
the tier is only the fallback. `has_nutritional_coach` gates the nutrition tab;
`strength_calibrated` says whether strength has been set up at all. Both are
already-true signals on this account, so they cannot be tested here, but the rule
matches how the rest of this codebase treats the API (`session-setup.ts`:
"Trenara decides what is changeable"). A Pro account with
`has_nutritional_coach: false` gets no nutrition tab, and that is not an upsell —
it is a feature they have not switched on. Two different empty states:

- **locked** — the tier does not include it → upsell.
- **unavailable** — the tier includes it, the account has not set it up → the
  feature's own copy ("calibrate strength first"), never a paywall.

## 3. Module layout

Five new files.

```
src/lib/entitlements.ts             pure: tiers, feature catalogue, resolver   (+ .test.ts)
src/lib/stores/entitlements.svelte.ts   client-side holder, mirrors app-config.svelte.ts
src/lib/server/entitlements.ts      requireFeature() for API routes           (+ .test.ts)
src/lib/components/shared/gate.svelte   the presentation wrapper
src/lib/components/shared/upsell-sheet.svelte
```

`src/lib/entitlements.ts` is isomorphic and dependency-free so both sides share
one definition of the truth. Sketch:

```ts
import type { User } from '$lib/server/trenara/types';

export type Tier = 'basic' | 'peak' | 'pro';
export type TierState = Tier | 'unknown';

const RANK: Record<Tier, number> = { basic: 0, peak: 1, pro: 2 };

/**
 * Wire value → tier. Only `"pro"` has been seen on real traffic; the rest are
 * guesses and are marked as such until an account on that plan is captured.
 * Anything not in here resolves to `pro` — see `tierOf`.
 */
const TIER_BY_PREMIUM_TYPE: Record<string, Tier> = {
	pro: 'pro',
	peak: 'peak', // unverified
	basic: 'basic', // unverified
	starter: 'basic' // unverified
};

export type FeatureKey =
	| 'terrain'
	| 'rpe'
	| 'strength-tab'
	| 'nutrition-tab'
	| 'distance-week'
	| 'distance-by-week'
	| 'training-load'
	| 'move-session'
	| 'delete-session'
	| 'week-overview';

export interface Feature {
	tier: Tier;
	/** How a locked feature presents itself. */
	mode: 'hide' | 'lock' | 'blur';
	/** One line, shown on the upsell. Written from the runner's side. */
	pitch: string;
}

export const FEATURES: Record<FeatureKey, Feature> = {
	terrain: { tier: 'pro', mode: 'lock', pitch: 'Tell the coach what you are running on.' },
	rpe: { tier: 'pro', mode: 'lock', pitch: 'Rate how hard a session felt.' },
	'strength-tab': { tier: 'pro', mode: 'lock', pitch: 'Your strength work, beside the run.' },
	'nutrition-tab': { tier: 'pro', mode: 'lock', pitch: 'What to eat around the session.' },
	'distance-week': { tier: 'pro', mode: 'blur', pitch: 'This week’s distance, day by day.' },
	'distance-by-week': { tier: 'pro', mode: 'blur', pitch: 'Every week of the plan, at a glance.' },
	'training-load': { tier: 'pro', mode: 'lock', pitch: 'What the session actually cost you.' },
	'move-session': { tier: 'peak', mode: 'lock', pitch: 'Move a session to a day that works.' },
	'delete-session': {
		tier: 'peak',
		mode: 'lock',
		pitch: 'Drop a session you are not going to run.'
	},
	'week-overview': { tier: 'peak', mode: 'hide', pitch: 'This week’s progress, on every page.' }
};

export function tierOf(user: User | null | undefined, now = Date.now()): TierState {
	if (!user) return 'unknown';
	if (!user.has_premium) return 'basic';
	if (typeof user.premium_until === 'number' && user.premium_until * 1000 < now) return 'basic';
	const mapped = TIER_BY_PREMIUM_TYPE[user.premium_type?.toLowerCase?.() ?? ''];
	// Unrecognised, non-empty type: fail open rather than lock a paying account
	// out of what it bought. Reported on the profile screen so it gets mapped.
	return mapped ?? (user.premium_type ? 'pro' : 'basic');
}

export type Access = 'granted' | 'locked' | 'unknown';

export function accessTo(feature: FeatureKey, user: User | null | undefined): Access {
	const tier = tierOf(user);
	if (tier === 'unknown') return 'unknown';
	return RANK[tier] >= RANK[FEATURES[feature].tier] ? 'granted' : 'locked';
}
```

The catalogue being data, not scattered `if`s, is the point: the tier line moves
by editing one table, and a test can walk every key.

## 4. Getting the tier to the client

`(app)/+layout.server.ts` already streams `userData`, and `(app)/+layout.svelte`
already resolves it into local state. Set the store from that same `.then`:

```ts
// src/lib/stores/entitlements.svelte.ts — same shape as app-config.svelte.ts,
// and for the same reason: wanted several components deep, threading it through
// every layer in between would be all cost.
let user = $state<User | null>(null);
let status = $state<'pending' | 'ready' | 'failed'>('pending');

export const entitlements = {
	/** The layout calls this from the streamed profile's `.then`. */
	set(value: User) {
		user = value;
		status = 'ready';
	},
	/** ...and this from its `.catch`. Failure grants, it does not lock — see §6. */
	fail() {
		user = null;
		status = 'failed';
	},
	get tier(): TierState {
		return status === 'ready' ? tierOf(user) : 'unknown';
	},
	access(feature: FeatureKey): Access {
		if (status === 'failed') return 'granted';
		if (status === 'pending') return 'unknown';
		return accessTo(feature, user);
	},
	can(feature: FeatureKey): boolean {
		return this.access(feature) !== 'locked';
	}
};
```

Note `can()`: everything that is not positively _locked_ is allowed. A helper
that answers "may I?" with `false` because the answer has not arrived yet is how
a gate turns into an outage.

Streamed means gates resolve a beat after first paint. That is consistent with
how this app already behaves (the setup rail shows a loading state until the
detail lands), and the `unknown` state keeps it from flashing. If the delay turns
out to be visible on the tabs, the fallback is the same trick `hooks.server.ts`
already uses for identity: write the tier into an HMAC-signed cookie next to
`user_id_sig` whenever `getCurrentUser` runs, and read it synchronously in
`load`. Do that only if the flash is real — it is a cache with an invalidation
problem attached.

One exception ships server-side from the start: `week-overview`. `loadWeekProgress`
costs two upstream calls and a Basic account must not pay them, so the layout load
needs the tier before it decides to call. That is the one place worth awaiting the
profile (it is already in flight for `userData`, so awaiting it there costs the
streaming benefit on the navbar rings only, not on the page).

## 5. Enforcing on the server

`agents.md` is explicit — zero trust, verify state server-side, never let the
browser be the thing that decides. A hidden button is a UI affordance, not a
gate. Every gated route gets one line:

```ts
// src/lib/server/entitlements.ts
export async function requireFeature(cookies: Cookies, feature: FeatureKey): Promise<void> {
	const user = await cachedCurrentUser(cookies); // per-request memo
	if (accessTo(feature, user) === 'granted') return;
	error(402, `Your plan does not include ${FEATURES[feature].pitch}`);
}
```

Applied to: `/api/v1/training/[id]/condition` (terrain), `/api/v1/feedback` (rpe),
`/api/v1/nutrition` (nutrition-tab), `/api/v1/training/move` (move-session, both
the `test` and `save` actions), `/api/v1/training/delete` (delete-session).

`402 Payment Required` rather than 403: it is the honest status, and it gives the
client something to key on — a 402 from any of these routes should raise the
upsell sheet rather than a red toast.

The cost is one `/api/me` per gated mutation. Mitigations, in order of preference:

1. **Per-request memo** — a `WeakMap`-free module-level cache keyed off the
   request event, so a route that already loaded the user does not refetch.
2. **Short-TTL signed cookie** — the tier plus an expiry, signed with the existing
   `SESSION_SECRET` helper in `user-identity.ts`, refreshed on every
   `getCurrentUser`. ~15 minutes is generous for a plan change and removes the
   call from the hot path entirely.

Start with (1); add (2) if the added latency shows up on the move/delete paths,
which are the only interactive ones.

## 6. Nothing may break

The gate is chrome laid over an app that has to keep working. Two things can go
wrong — the tier is not known, or the runner arrives somewhere a gate has taken
something away — and neither may produce a dead end.

### Unknown resolves to granted

`userData` is streamed and can fail; the layout already handles a rejected
promise by setting `userData = null`. A Trenara outage must not cost a Pro
subscriber their nutrition tab, so:

- **`ready`** → the tier decides.
- **`failed`** → every feature granted. The upstream API is the real gate on
  every write anyway, so the worst case is a clear 402 instead of a lock the
  runner cannot explain or escape.
- **`pending`** → the short window before the streamed profile lands. Gates
  render neither the feature nor a lock: a control that appears and then locks is
  worse than one that arrives a beat late, and a control that is live for 200 ms
  can be clicked into a 402. Anything structural — a tab, an option in a picker —
  keeps its place in the layout and is inert until the tier is known, so nothing
  reflows under the runner's finger.

**A gate may not throw.** An unmapped feature key, a null user, a store that was
never set: all resolve to granted rather than raising. This is the rule the
layout already applies to the news and chat badges — chrome may not be able to
fail the page behind it.

### Navigation

**No route is gated.** Gating is per-control, never per-page. `/dashboard`,
`/goal`, `/history`, `/news`, `/profile` render for every tier; what differs is a
blurred chart or a locked chip inside them. No tier redirect and no tier 404 —
links get bookmarked and shared between accounts, and bouncing someone off their
own goal page is a far worse bug than a blurred graph. If some page ever becomes
wholly Pro, it gets a locked state _on_ the page, not a redirect away from it.

**A locked control is never the destination.** Concretely, in the three places
this design touches navigation:

- `calendar-details.svelte` auto-selects a tab when the selected day changes.
  That effect must skip locked tabs. A Basic runner opening a strength-only day
  would otherwise land on Strength, so the fallback is the day's own empty state
  ("nothing scheduled") with the locked tab still visible beside it. Never an
  empty card, and never a tab bar whose only tab is locked and selected.
- The graph picker keeps `prediction` as its initial value (it already does), and
  a locked value arriving from anywhere later — restored state, a URL param —
  falls back to `prediction` rather than rendering an empty chart well.
- Hiding the navbar rings must not remove the only path to something. They link
  to `/goal`, which is also a menu item; keep it that way. When they go, the
  mobile strip that holds them (`hasAnyRing`, `border-t px-4 py-2`) collapses
  whole — no empty bordered band, no layout shift between tiers. `hasAnyRing`
  already returns false on null progress, so this falls out of §4's decision not
  to fetch, but it is worth an explicit test.

**Back, forward and reload land in the same place.** Nothing about a gate goes
into the URL or into history. A locked click opens the upsell, and closing the
upsell returns exactly where the runner was.

### Data keeps flowing

A gate hides a rendering, not a payload. `userStats` still parses when the
distance graphs are locked: the goal card's forecast, the progress bar and the
week rings all read that same object, and short-circuiting the parse to "save
work" would take out three things in order to hide one. The single exception is
`loadWeekProgress`, skipped on Basic because it costs two upstream calls and
nothing else consumes it — and it is skipped by returning `null`, the value every
consumer already treats as "nothing to show", not by introducing a new shape.

### Errors stay legible

- `requireFeature` runs **after** the existing `locals.user` check, so an expired
  session is still a 401 and still redirects to login. A 402 must never be
  reachable by someone who is merely logged out.
- A 402 from a gated route raises the upsell sheet — not a red toast, not an
  error boundary, never a logout.
- If `requireFeature` cannot resolve the profile because the upstream is down, it
  grants. Same rule as the client; the two must not disagree about failure.

## 7. How a locked feature looks

Three modes, declared per feature in the catalogue so behaviour is data rather
than ten hand-written branches.

- **`hide`** — the feature is simply absent. For chrome the runner never asked
  for: the navbar rings. No upsell; an advert bolted to the navigation on every
  page is worse than nothing.
- **`lock`** — the affordance stays where it is, muted, with a small lock, and
  opens the upsell instead of acting. This is the default and the one that
  matches the phone app: you can see the app has a nutrition tab, and tapping it
  tells you what it costs.
- **`blur`** — the real thing is rendered under a blur with the upsell over it,
  and the control that selects it is disabled. Only the two distance graphs,
  which is exactly what the phone app does with them.

A single wrapper carries all three:

```svelte
<!-- gate.svelte -->
<script lang="ts">
	let {
		feature,
		children,
		unavailable
	}: {
		feature: FeatureKey;
		children: Snippet;
		/** Renders instead of an upsell when the tier allows it but the account
		    has not set it up — see §2. */
		unavailable?: Snippet;
	} = $props();

	const access = $derived(entitlements.access(feature));
	const mode = $derived(FEATURES[feature].mode);
</script>

{#if access === 'unknown'}
	<!-- nothing: never flash a lock at someone whose plan we have not read yet -->
{:else if access === 'granted'}
	{@render children()}
{:else if mode === 'blur'}
	<div class="relative">
		<div class="pointer-events-none blur-sm select-none" aria-hidden="true">
			{@render children()}
		</div>
		<UpsellOverlay {feature} />
	</div>
{:else if mode === 'lock'}
	<LockedChip {feature} />
{/if}
```

Blur needs care for accessibility: the blurred copy is `aria-hidden` and
inert, and the overlay carries the real, readable text. Blurring a chart without
that leaves a screen reader announcing numbers the runner has not paid for.

The upsell sheet itself names the tier, the feature, and what else comes with the
tier (drawn from `FEATURES` — every key whose `tier` matches). It does **not**
sell anything: there is no payment flow in this client and there should not be
one. The CTA opens Trenara's own upgrade path, and reads "Start your free trial"
when `has_right_on_free_trial` is true, "Upgrade in the Trenara app" otherwise.

Per-site notes:

- **Tabs** (`calendar-details.svelte`) — keep locked tabs in `availableTabs` so
  the tab bar shows what the app has, but make the click open the upsell and
  never let `activeTab` land on a locked tab (the auto-select effect must skip
  them, or a Basic runner opens a day with only strength work and lands on a
  paywall with no way back).
- **Terrain** (`session-setup.ts`) — drop the `terrain` setting to
  `chip: false`-equivalent handling rather than filtering it out of `settings`
  entirely; the rail should show the locked chip. Guard `sessionSettings` with
  the gate rather than adding a tier argument to a pure function that currently
  knows only about the training.
- **Graph picker** (`goal-card.svelte`) — keep both options in the `<select>`,
  disabled, and let a locked selection fall back to `prediction`.
- **Delete / move** (`training-details.svelte`) — `canDelete` already encodes
  Trenara's own rules; the gate composes with it (`canDelete && granted`), it
  does not replace it. A session Trenara pins stays undeletable on Pro.

## 8. What we do not know yet

The single blocking unknown: **the `premium_type` strings for Basic and Peak.**
Only `"pro"` has been captured. The map in §3 guesses `"basic"` and `"peak"`, and
the fail-open rule means a wrong guess is invisible — a Peak account whose type
string is `"peak_yearly"` would resolve to Pro and nothing would look broken.

Two things fix that:

1. The profile screen already prints `premium_type`. Add the resolved tier beside
   it and a marker when the value was not in the map ("pro (unmapped:
   peak_yearly)"). Costs three lines, turns a silent wrong answer into a bug
   report.
2. A one-off log line, server-side, on an unmapped value.

Also unverified, and worth confirming against the phone app before shipping:

- whether locked tabs are shown-and-locked or absent (assumed shown-and-locked);
- whether Peak really has no access to the distance graphs, or only Basic is
  blurred (the brief says Pro-only, so that is what §1 encodes);
- whether trials (`premium_trial: true`) carry the trial's tier in
  `premium_type`, or the pre-trial one — if the latter, `tierOf` needs a trial
  branch;
- whether Trenara's backend actually refuses a Basic account's terrain POST. If
  it does not, our 402 is a product decision rather than an echo of the API's,
  which is worth being deliberate about — it is what parity means, but it is us
  choosing it.

## 9. Testing

- `entitlements.test.ts` — table-driven over `tierOf`: no premium, expired
  `premium_until`, each mapped string, an unmapped string, a missing profile.
  Then a walk of every `FeatureKey` × every tier asserting the access matrix,
  which is what catches a catalogue edit that moves a line by accident.
- Component tests for one representative of each mode: a locked tab (`lock`), the
  graph picker (`blur`), and the navbar rings (`hide`). Assert the locked case
  renders no live control, and — for blur — that the blurred content is
  `aria-hidden`.
- Route tests: a gated route returns 402 for Basic and passes through for Pro,
  and still returns 401 — not 402 — with no session.
- The §6 invariants, which are the ones that would actually hurt someone:
  a rejected `userData` promise grants every feature; a `pending` store renders
  neither feature nor lock; a strength-only day on Basic renders the day rather
  than an empty card, with no locked tab selected; the mobile ring strip is
  absent rather than empty; a graph view that is locked falls back to
  `prediction`; a 402 raises the upsell and leaves the session intact.
- `payloads.test.ts` — pin the premium block on the `User` fixture, so a change
  in the response shape fails a test rather than a runtime tier resolution.
- The existing suite should stay green untouched: every fixture in the repo is a
  Pro account, so gating changes nothing for them. If a test breaks, the gate is
  in the wrong place.

## 10. Order of work

1. `entitlements.ts` + tests, and the profile-screen readout from §8. Ships alone,
   changes no behaviour, and starts collecting the string we are missing.
2. The store, the `Gate` component and the upsell sheet, with the §6 failure
   behaviour (pending renders nothing, failed grants) and its tests. Still no
   behaviour change — nothing is wrapped yet — but the safety net exists before
   anything hangs off it.
3. The presentation-only gates — the two tabs, both distance graphs, the
   training-load readout, the terrain chip, the RPE control. No fetching
   changes, so each is easy to reverse.
4. `move` / `delete` / `week-overview`, client and server together, since these
   are the ones where a hidden button and an open endpoint would be a real
   mismatch.
5. `requireFeature` on the remaining routes, plus the memo.

Steps 1 and 2 are safe to land before the unknowns in §8 are resolved. Step 3
onwards should wait for the real `premium_type` strings, or a Basic account gets
gated by a guess.
