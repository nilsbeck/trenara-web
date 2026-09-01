# Upstream API reference

Notes on the API this app reads from. It is not our API and it is not
documented publicly, so this file is the record of what each endpoint actually
returns — captured from live responses, not from a spec.

**Samples are real responses from one account, with identifiers redacted**
(e-mail, uuid, team join code, media filenames). Field _values_ are otherwise
untouched, because the shapes here are the only contract we have: the backend
mixes formatted strings (`"03:43 min/km"`) with raw values (`223`) and unit
tags (`"min/km"`) for the same quantity, and which of the three a field carries
matters when you type it.

## Conventions

- **Base URL:** held as `BASE_URL` in `src/lib/server/trenara/client.ts`, which
  prefixes every relative path recorded here. Deliberately not repeated in this
  file — the client is the one place it belongs.
- **Auth:** `Authorization: Bearer <access_token>` on everything except
  login/refresh. `bearerHeader(cookies)` in `src/lib/server/trenara/*.ts`
  builds it from the access-token cookie.
- **Server-side only.** Browser code never calls this host; it calls our own
  `/api/v1/*` routes, which call upstream with the user's token.
- **Trailing slashes vary by path** — `/api/threads/`, `/api/news/` and
  `/api/dashboard/` are written with one, `/api/me` and `/api/goal` without.
  `/api/me/stats` answers either way, so it is not strictly load-bearing
  everywhere, but which paths tolerate which has not been tested: use the exact
  path recorded here.
- **Wire values are quoted verbatim**, including the two that carry a vendor
  name (`"time_type_selected": "trenara_time"` on a goal, and the boolean
  `trenara` on an entry). They are the strings the API actually sends, so
  rewriting them would make this file wrong.
- **Timestamps** come in three flavours: unix seconds (`created_at`,
  `premium_until`), ISO-8601 with offset (`start_time`, notification
  `created_at`), and plain dates (`"2026-09-27"`). Per field, not per endpoint.

## Naming collision

Our own `/api/v1/dashboard` (`src/routes/api/v1/dashboard/+server.ts`) is **not**
a proxy of upstream `/api/dashboard/`. Ours fans out to `/api/goal` and
`/api/me/stats` and returns `{ goal, userStats }` for a background refresh.
Upstream's is the mobile app's home screen payload, described below.

## Endpoint index

Endpoints the app already calls live in `src/lib/server/trenara/`:

| Method      | Path                                                                                                | Wrapper                                                  |
| ----------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| POST        | `/oauth/token`                                                                                      | `authApi.login` / `refreshToken`                         |
| GET         | `/api/me`                                                                                           | `userApi.getCurrentUser`                                 |
| PUT         | `/api/me`                                                                                           | `userApi.updateProfile`                                  |
| POST        | `/api/me/pause/`                                                                                    | `userApi.pausePlan`                                      |
| GET         | `/api/me/stats`                                                                                     | `userApi.getUserStats`                                   |
| GET         | `/api/me/shoes`                                                                                     | `userApi.getShoes`                                       |
| GET         | `/api/goal`                                                                                         | `trainingApi.getGoal`                                    |
| DELETE      | `/api/goal`                                                                                         | `trainingApi.deleteGoal`                                 |
| GET         | `/api/schedule/week/?timestamp=`                                                                    | `trainingApi.getSchedule`                                |
| GET         | `/api/schedule/trainings/{id}`                                                                      | `trainingApi.getScheduledTraining`                       |
| PUT         | `/api/schedule/trainings/{id}/{intensity,distance,cooldown,suggested_shoe,cross_train,pacing_plan}` | `trainingApi.set*` / `crossTrain`                        |
| POST        | `/api/schedule/trainings/{id}/training_condition`                                                   | `trainingApi.setTrainingCondition`                       |
| GET/PUT     | `/api/schedule/trainings/{id}/exchange`                                                             | `trainingApi.getExchangeCandidates` / `exchangeTraining` |
| PUT         | `/api/schedule/trainings/{id}/change_test`, `/change_save`                                          | `trainingApi.testChangeDate` / `saveChangeDate`          |
| DELETE      | `/api/schedule/trainings/{id}`                                                                      | `trainingApi.deleteScheduledTraining`                    |
| POST/DELETE | `/api/entries`, `/api/entries/{id}`                                                                 | `trainingApi.addTraining` / `deleteTraining`             |
| PUT         | `/api/entries/{id}/rpe`                                                                             | `trainingApi.putFeedback`                                |
| GET         | `/api/nutritional/advice`                                                                           | `trainingApi.getNutritionAdvice`                         |
| GET         | `/api/threads/`, `/api/threads/{id}/messages`                                                       | `chatApi.getThreads` / `getMessages`                     |
| POST        | `/api/threads/{id}/messages`                                                                        | `chatApi.sendMessage`                                    |
| GET         | `/api/news/`                                                                                        | `newsApi.getNews`                                        |
| GET         | `/api/config/app`                                                                                   | `configApi.getAppConfig`                                 |

Endpoints recorded below are **not wired up yet** unless the section says so.

Their types in `src/lib/server/trenara/types.ts` were written at different
times and are not all current — `Goal` was a version behind until a capture
caught it. A captured response in this file outranks the type that claims to
describe it.

---

## Rate limit

**60 requests per minute**, per the headers on a refusal captured 2026-08-29:

```
HTTP 429
retry-after: 47
x-ratelimit-limit: 60
x-ratelimit-remaining: 0
x-ratelimit-reset: 1788042395
```

`x-ratelimit-reset` is a Unix second and matches `retry-after`, so the window
is a fixed minute rather than a rolling one — the budget refills all at once
rather than draining request by request. Two things follow.

First, **spacing requests out does not help**: a fixed window counts them
however they are spread, so a concurrency limiter would buy nothing here. Only
sending fewer helps, which is why `read-cache.ts` exists.

Second, sixty is not much for this app. There is no month endpoint — only
`/api/schedule/week/?timestamp=` — so one month of the calendar costs five or
six requests, and a dashboard load costs eleven or twelve all told. The minute
that tripped the limit held 47 requests from a single serverless instance, 24
of them weeks.

Every response carries the `x-ratelimit-*` headers, not just a refusal, so the
remaining budget can be read at any time. A 429 is never retried: retrying a
refusal for going too fast is the one response guaranteed to make it worse.
`RateLimitError` carries a snapshot of what was being sent in the run-up —
see `rate-limit.ts`, and the error page, which shows it.

---

## POST /oauth/token

The only endpoint that is not `/api/*`, and the only one that is neither sent
nor answered on the app's usual terms. Everything else here takes JSON and a
`Authorization: Bearer <access_token>`; this takes a **form-encoded** body and
a `Authorization: Basic <BASIC_BEARER_TOKEN>` — the client credential from the
environment, not a user token. It is what mints the Bearer the rest of the API
wants.

Called by `authApi.login` and `authApi.refreshToken`, which reach past the
`get`/`post` helpers to `fetchClient.request` for exactly this reason: those
helpers hard-code a JSON content type. The refresh call sets `retries: 2`,
since losing a session to a blip would log the user out for no reason.

The captured URL carried a trailing slash (`/oauth/token/`); the code sends
none and works, so both appear to answer. Per the trailing-slash convention
above, keep sending the path the code sends.

### Request

Form-encoded (`application/x-www-form-urlencoded`), not JSON. Two grants,
distinguished by `grant_type`. The refresh body is captured off the wire; the
password body is read from `authApi.login`, not observed:

```
grant_type=refresh_token&refresh_token=<refresh_token>
grant_type=password&username=<email>&password=<password>
```

Values are URL-encoded — `authApi` builds both with `URLSearchParams`, so a
password containing `&` or `+` survives the trip.

### Response

Captured from the **refresh** grant, and matching `AuthResponse` field for
field. The password grant is assumed to answer the same way — the app treats
the two responses interchangeably — but that has not been captured.

- `expires_in` is **seconds** (172800 = 48 hours), unlike the timestamps
  elsewhere in this API. It describes `access_token` only; nothing in the
  response says when `refresh_token` expires.
- No scope, id_token, or user payload comes back — `GET /api/me` is a separate
  call.

```json
{
	"token_type": "Bearer",
	"expires_in": 172800,
	"access_token": "<redacted>",
	"refresh_token": "<redacted>"
}
```

---

## GET /api/config/app

Static app configuration: copy, enumerations, and the option lists the mobile
app renders pickers from. No user data — the interesting part is that several
enumerations we used to hard-code (`SHOE_TYPES`, `CROSS_TYPES` in
`src/lib/server/trenara/types.ts`) are served from here, so this is the source
of truth if they ever change.

Read by `configApi.getAppConfig`, cached for the process and streamed from the
app layout. The activity picker, the shoe labels and the pause dialog's reasons
come from it; the brand list, the percentage bound and the copy are typed but
have no screen yet. The constants remain as the fallback for a request that
failed.

### Notable fields

- `pause_types[]` — the reasons a plan can be paused, in display `order`.
  `ask_extra_input` marks the ones that want a free-text follow-up
  (injury, motivation, other). Read by `$lib/utils/pause`, which is what the
  pause dialog renders from; `type` is the value `POST /api/me/pause/` takes,
  and `title` is localised upstream, so nothing may key off it.
- `shoes.brands[]` — flat list, `"Other"` last; `shoes.types[]` uses `tag` as
  the wire value and `name` as the label. `changes_intensity` is `false` for
  every type today, but it exists, so treat it as a real flag rather than
  assuming super shoes never adjust pace.
- `cross_training.types[]` carries `icon_path` (absolute SVG URL on the backend
  host) and a `color` per type — worth reusing so cross-training entries match
  the app's colours. `percentage_range: 40` is the ± window allowed on a
  cross-training effort percentage.
- `nutritional.disclaimer` and `perks.*` are plain copy.
- `init_popup` is a single string holding three variants separated by blank
  lines and leading `-`, keyed to the onboarding volume choice (starter,
  5–10 km, 10 km+). It is not structured; the app splits it.

### Sample response

```json
{
	"perks": {
		"title": "Our partners",
		"description": "…"
	},
	"nutritional": {
		"disclaimer": "Before you start using the nutritional coach..."
	},
	"pause_types": [
		{ "order": 1, "type": "illness", "title": "Illness", "ask_extra_input": false },
		{ "order": 2, "type": "injury", "title": "Injury", "ask_extra_input": true },
		{ "order": 3, "type": "holiday", "title": "Holiday", "ask_extra_input": false },
		{ "order": 4, "type": "motivation", "title": "Motivation", "ask_extra_input": true },
		{ "order": 5, "type": "other", "title": "Other", "ask_extra_input": true }
	],
	"init_popup": "- Based on your selection, we recommend following a starter plan…\n\n- By selecting 5–10 km, you can set any goal you want…\n\n- So, you can comfortably run 10K or more…",
	"shoes": {
		"brands": [
			"Adidas",
			"Altra",
			"ASICS",
			"Brooks",
			"Craft",
			"Diadora",
			"Hoka",
			"Karhu",
			"Kiprun",
			"Mizuno",
			"New Balance",
			"Nike",
			"On",
			"Puma",
			"Salomon",
			"Saucony",
			"Scott",
			"Other"
		],
		"types": [
			{ "tag": "dailytrainer", "name": "Daily Trainer", "changes_intensity": false },
			{ "tag": "supertrainer", "name": "Super trainer", "changes_intensity": false },
			{ "tag": "supershoe", "name": "Super shoe", "changes_intensity": false },
			{ "tag": "long_run", "name": "Long run", "changes_intensity": false },
			{ "tag": "trail", "name": "Trail", "changes_intensity": false }
		]
	},
	"cross_training": {
		"percentage_range": 40,
		"types": [
			{
				"type": "road_bike",
				"name": "Cycling",
				"icon_path": "https://<api-host>/icons/cross_training/bike.svg",
				"color": "#1BB9AA"
			},
			{
				"type": "mountain_bike",
				"name": "MTB",
				"icon_path": "https://<api-host>/icons/cross_training/mountain_bike.svg",
				"color": "#A3B93E"
			},
			{
				"type": "swimming",
				"name": "Swimming",
				"icon_path": "https://<api-host>/icons/cross_training/swim.svg",
				"color": "#00ACC1"
			},
			{
				"type": "crosstrainer",
				"name": "Cross trainer",
				"icon_path": "https://<api-host>/icons/cross_training/elliptical.svg",
				"color": "#6574D8"
			},
			{
				"type": "elliptical",
				"name": "Elliptical bike",
				"icon_path": "https://<api-host>/icons/cross_training/elliptical.svg",
				"color": "#78909C"
			},
			{
				"type": "indoor_cycling",
				"name": "Indoor cycling",
				"icon_path": "https://<api-host>/icons/cross_training/bike.svg",
				"color": "#009688"
			}
		]
	}
}
```

The `init_popup` string is elided above; the full text is three paragraphs of
coaching copy. Everything else is verbatim.

---

## GET /api/dashboard/

The mobile app's home screen in one call: last notification, current goal, next
training (fully expanded, blocks and all), last logged entry, energy/ATL gauge,
recent medals, and a handful of "should the app ask something" flags.

Not used by this app yet — our dashboard composes `/api/goal`, `/api/me/stats`
and `/api/schedule/week/` instead. If we ever want the coach notification, the
energy bar or the medals, this is where they come from, and it would replace
three round trips with one.

Trailing slash required.

### Notable fields

- `last_notification` — the coach's message about the last activity.
  `metadata` varies by `notification_type`; for `"training"` it carries three
  Training Stress Score figures — `goal_daily_tss` (the plan's load for that
  day), `goal_pvt_tss` (the same target as a round number, plausibly the value
  as authored in the coach's sheet, given the `excel_id` on the goal) and
  `done_tss` (what the session earned). TSS is the usual metric where an hour
  at threshold is 100, and the capture agrees with it: a 50-minute easy run
  scored 36.97. Their ratio picks the copy — 81% of target here produced the
  "you're really trying" message, tagged `type: "training_normal"` — so a
  client can render done-vs-goal as a bar rather than only printing the
  sentence. `actions: ["share"]` is the button list. The same object is
  repeated inside `last_entry.notification`.
  - `done_tss` looks computed upstream from pace against the account's
    thresholds, not relayed from the watch. The capture's entry ran 3037 s at
    `pace_value: 379`; the standard IF² x hours x 100 gives 35.25 against
    `pace_lt2_value` 245 and 37.30 against the 252 of `pace_for_goal`, where
    the actual figure is 36.9671 — an implied threshold of 250.9 s/km, within
    a percent of a textbook rTSS. It fits the rest of the account too:
    `heartbeat_prior: false` with both pace thresholds set is a pace-driven
    model, and a treadmill run (`gps: false`) is flat, so average pace stands
    in for normalized graded pace. The watch has no TSS to pass through in any
    case — its metrics are Training Effect and an EPOC-derived Training Load,
    and it labels anything TSS only for power-based cycling. Nothing in these
    payloads carries a watch-side load figure: the entry has no field for one
    and `gps_media[].meta` advertises samples only. To settle it, log a manual
    entry through `POST /api/entries`, where no integration is involved; a
    `done_tss` on that response rules pass-through out.
- `current_goal` — nearly the same shape as `GET /api/goal` (`Goal` in
  `types.ts`), and **the fresher of the two records**: this capture is current,
  our `Goal` type was written against an older response. Where they disagree,
  believe this one. Its `week[]` entries are `{ day, excel_id, training_id }`
  while `Goal.week[]` is still typed `{ day, prior }` — nothing in the app
  reads `week` today, which is why the drift went unnoticed. The embedded copy
  also has no `description` or `updated_at` — and neither does `/api/goal`
  itself, captured a day later, so those two are gone from the API rather than
  trimmed from this copy.
- `current_goal.week[]` is the plan's repeating weekly pattern — one entry per
  training day, `number_of_trainings` of them — and it is what the backend
  expands from `start_date` to `end_date` into the dated sessions the calendar
  shows. **It is a skeleton, not a display payload:** an entry carries `day`,
  `training_id` and `excel_id` and nothing else — no title, type, distance,
  icon or colour — so it tells you a session falls on Friday but never that
  Friday is a long run. Nothing captured so far resolves a `training_id` into
  session details; `GET /api/schedule/trainings/{id}` takes the nine-digit
  scheduled id, and whether it also accepts a four-digit template id is
  untested. For what a session actually is, fetch `/api/schedule/week/`, whose
  trainings are full `ScheduledTraining` objects. What `week[]` is good for is
  the shape of the week without a schedule fetch (how many sessions, which
  days), and slot identity across weeks: the dated sessions each have their own
  id, so only this tells you that two Fridays are the same recurring slot —
  which is what a training-days editor, or detecting that the plan itself
  changed, needs. Being the goal's pattern, it is also the plan's intent, where
  the schedule is what became of it after moves and exchanges.
  - `day` is **0 = Monday**: this capture's `{0, 2, 4, 6}` are exactly the four
    days `/api/me/stats/` gives a `todo` (Mon, Wed, Fri, Sun), and
    `next_training` on Wednesday 2026-08-26 carries the 6.78 km that stats
    lists for Wednesday, matching the `day: 2` slot. Caveat: this account has
    `start_of_week: "monday"`, so "0 = Monday" and "0 = the user's own start of
    week" both fit the evidence. A Sunday-start account would tell them apart.
  - `training_id` points at a plan-template training, not a scheduled one — the
    ids here are four digits (2557-2563) where `next_training.id` is nine. Same
    session, two identities: the recurring definition and the dated instance.
  - `excel_id` is the row in the coach's source sheet, and moves with
    `training_id` at a constant offset (3→2557, 4→2558, 5→2559, 9→2563), so a
    scheme's trainings are one contiguous block of templates. The gaps in the
    sequence are the sessions this runner's four-a-week plan does not use.
  - The array is not sorted — not by `day`, `excel_id` or `training_id`. Sort
    it yourself before rendering a week.
  - Our `Goal.week[]` still carries a `prior` the backend no longer sends;
    going by the name it ordered the week by priority, but that is inference,
    not a recorded response.
- `next_training` — a `ScheduledTraining`. Everything the training detail sheet
  needs is inlined: `change_distance_package` / `change_intensity_package`
  (the fine-tune steppers, with `selected` marking the current value),
  `team_data`, and `training.blocks[]` with nested `core` blocks carrying
  `repeat`. `show_description_from` is the unix time before which the
  description should stay hidden.
- `last_entry` — an `Entry`, including `gps_media[]`. Six fields it returns are
  missing from our `Entry` type: `allow_shoe`, `ask_feedback`, `cross_type` and
  the trio `cross_percentage` / `_min` / `_max`. The percentages are how a
  cross-trained session appears to have its load accounted for — a swim has no
  pace to score against a threshold, so the effort is expressed as a share of
  what was planned, bounded by `cross_training.percentage_range` (40) from
  `/api/config/app`. All three were `null` here because this entry was a run; a
  capture taken after a logged swim or ride would show what they hold and
  whether such an entry carries a `done_tss` at all. The media `meta` tells you
  what the track actually contains before you download it: `gps: false` on a
  treadmill run, `points` after compression vs. `points_before_compression`.
- `energy_value` (0–100) with `energy_title` / `energy_description` — the ATL
  vs. CTL gauge and its explainer copy, served as text.
- Prompt flags: `ask_for_sleep`, `ask_for_rpe`, `count_open_rpe`,
  `ask_for_review` (+ `ask_for_review_text`). The app uses these to decide which
  modal to raise on open.
- `last_medals[]` — achieved medals, newest first, each with `target` /
  `progress` in both formatted and raw form, `progress_percentage`, and a
  `picture`. `is_sponsored` / `is_premium_only` / `is_featured` gate display.
- `featured_challenge`, `status_message`, `sleep_score` were all `null` in this
  capture; shapes unknown.

### Sample response

Medals reduced to one of three (identical shape), long coaching copy elided,
otherwise verbatim.

```json
{
	"last_notification": {
		"id": 18195634,
		"title": "Training",
		"content": "It is not that easy to strictly follow a training plan…",
		"notification_type": "training",
		"metadata": {
			"goal_daily_tss": 45.4991,
			"goal_pvt_tss": 45,
			"done_tss": 36.9671,
			"type": "training_normal"
		},
		"training_id": null,
		"entry_id": 29442588,
		"medal_id": null,
		"created_at": "2026-08-24T18:05:40+02:00",
		"actions": ["share"]
	},
	"current_goal": {
		"id": 2123705,
		"name": "15k nocturno",
		"number_of_trainings": 4,
		"week": [
			{ "day": 4, "excel_id": 5, "training_id": 2559 },
			{ "day": 0, "excel_id": 9, "training_id": 2563 },
			{ "day": 2, "excel_id": 3, "training_id": 2557 },
			{ "day": 6, "excel_id": 4, "training_id": 2558 }
		],
		"start_date": "2026-06-29",
		"end_date": "2026-09-27",
		"training_scheme_type": "ultimate",
		"time_type_selected": "trenara_time",
		"overrule_time": false,
		"can_be_edited": true,
		"edit_warning": "Watch out! As troop captain, changing the goal will mean everyone's goal will be changed. Are you sure you want to change it?",
		"created_at": 1782684230,
		"time": "56:00",
		"time_in_sec": 3360,
		"time_value": 3360,
		"time_unit": "sec",
		"distance": "15km",
		"distance_value": 15,
		"distance_unit": "km",
		"distance_unit_text": "km",
		"pace": "03:43 min/km",
		"pace_value": 223,
		"pace_unit": "min/km",
		"intermediate_goals": [],
		"training_condition": {
			"id": 3788086,
			"type": "Goal",
			"height_difference": "flat",
			"surface": "road",
			"intensity": 100,
			"updated_at": 1782684230,
			"height": null,
			"height_value": null,
			"height_unit": null,
			"height_unit_text": null
		}
	},
	"next_training": {
		"id": 127477832,
		"day": 1787695200,
		"day_long": "2026-08-26",
		"title": "Intervals",
		"description": "Designing this session down is easy…",
		"show_description_from": 1787090400,
		"type": "training",
		"icon_url": "https://<api-host>/icons/icon__step.svg",
		"hex_training": "#CC3311",
		"hex_completed": null,
		"last_garmin_sync": "2026-08-24 01:14:34",
		"can_be_edited": true,
		"can_cross_train": false,
		"cross_type": null,
		"can_toggle_cooldown": true,
		"has_cooldown": false,
		"can_change_distance": true,
		"change_distance_package": {
			"title": "Fine-tune intervals",
			"text": "When you're not feeling as fresh today…",
			"steps": [
				{ "step": 1, "value": 1, "text": "1x", "selected": false },
				{ "step": 2, "value": 2, "text": "2x", "selected": true },
				{ "step": 3, "value": 3, "text": "3x", "selected": false }
			]
		},
		"can_change_intensity": true,
		"change_intensity_package": {
			"title": "Fine-tune intensity",
			"text": "Change today's session intensity within limits set by the coach…",
			"steps": [
				{ "step": 1, "value": -4, "text": "Slower", "selected": false },
				{ "step": 2, "value": -2, "text": "A bit slower", "selected": false },
				{ "step": 3, "value": 0, "text": "As planned", "selected": true },
				{ "step": 4, "value": 2, "text": "A bit faster", "selected": false },
				{ "step": 5, "value": 4, "text": "Faster", "selected": false }
			]
		},
		"can_change_pacing_plan": false,
		"change_pacing_plan_package": null,
		"can_be_exchanged": true,
		"team_data": {
			"team_id": 470,
			"name": "Valencia 42k",
			"picture": null,
			"nr_same_day_participants": 0,
			"nr_other_day_participants": 0,
			"matches_captain_day": true,
			"captain_pace": true,
			"can_toggle_pace": false,
			"can_show_participant_overview": true
		},
		"training": {
			"blocks": [
				{
					"order": 1,
					"type": "warmup",
					"prior": "time",
					"hex_graph": "#44A6D3",
					"calc_time_in_sec": 900,
					"hex_text": "#FFFFFF",
					"time": "15:00",
					"time_in_sec": 900,
					"time_value": 900,
					"time_unit": "sec",
					"distance": "2.71km",
					"distance_value": 2.71,
					"distance_unit": "km",
					"distance_unit_text": "km",
					"pace": "05:32 min/km",
					"pace_value": 332,
					"pace_unit": "min/km",
					"pace_per_hour": "10.84 km/h",
					"pace_per_hour_value": 332,
					"pace_per_hour_unit": "km/h",
					"prefer_pph": true,
					"pace_range": "05:20-05:45 min/km",
					"pace_range_value_min": 345,
					"pace_range_value_max": 320,
					"pace_per_hour_range": "10.43-11.25 km/h",
					"pace_per_hour_range_value_min": 345,
					"pace_per_hour_range_value_max": 320,
					"text": "Warm-up: 15:00 at 05:20-05:45 min/km (2.71km)",
					"text_pph": "Warm-up: 15:00 at 10.43-11.25 km/h (2.71km)"
				},
				{
					"order": 2,
					"repeat": 2,
					"type": "core",
					"blocks": [
						{
							"order": 1,
							"type": "run",
							"prior": "distance",
							"hex_graph": "#7B3294",
							"hex_text": "#FFFFFF",
							"time": "05:36",
							"time_in_sec": 336,
							"time_value": 336,
							"time_unit": "sec",
							"distance": "1.5km",
							"distance_value": 1.5,
							"distance_unit": "km",
							"distance_unit_text": "km",
							"pace": "03:44 min/km",
							"pace_value": 224,
							"pace_unit": "min/km",
							"pace_per_hour": "16.07 km/h",
							"pace_per_hour_value": 224,
							"pace_per_hour_unit": "km/h",
							"prefer_pph": true,
							"text": "Run 1.5km in 05:36 (03:44 min/km)",
							"text_pph": "Run 1.5km in 05:36 (16.07 km/h)"
						},
						{
							"order": 2,
							"type": "rest",
							"prior": "time",
							"hex_graph": "#D6EAF8",
							"hex_text": "#FFFFFF",
							"time": "04:00",
							"time_in_sec": 240,
							"time_value": 240,
							"time_unit": "sec",
							"distance": "532m",
							"distance_value": 532,
							"distance_unit": "m",
							"distance_unit_text": "m",
							"pace": "07:31 min/km",
							"pace_value": 451,
							"pace_unit": "min/km",
							"pace_per_hour": "7.98 km/h",
							"pace_per_hour_value": 451,
							"pace_per_hour_unit": "km/h",
							"prefer_pph": true,
							"pace_range": "06:54-08:09 min/km",
							"pace_range_value_min": 489,
							"pace_range_value_max": 414,
							"pace_per_hour_range": "7.36-8.70 km/h",
							"pace_per_hour_range_value_min": 489,
							"pace_per_hour_range_value_max": 414,
							"text": "Rest 04:00 at 06:54-08:09 min/km (532m)",
							"text_pph": "Rest 04:00 at 7.36-8.70 km/h (532m)"
						}
					]
				}
			],
			"total_time_in_sec": 2052,
			"total_distance_in_km": 6.775156666666667,
			"core_time_in_sec": 672,
			"pre_advice": null,
			"post_advice": null,
			"core_distance": "3km",
			"core_distance_value": 3,
			"core_distance_unit": "km",
			"core_distance_unit_text": "km",
			"core_time": "11:12",
			"core_time_value": 672,
			"core_time_unit": "sec",
			"total_distance": "6.78km",
			"total_distance_value": 6.78,
			"total_distance_unit": "km",
			"total_distance_unit_text": "km",
			"total_time": "34:12",
			"total_time_value": 2052,
			"total_time_unit": "sec"
		}
	},
	"ask_for_sleep": false,
	"last_entry": {
		"id": 29442588,
		"name": "Garmin Treadmill running",
		"start_time": "2026-08-24T17:13:06+02:00",
		"type": "run",
		"icon": "https://<api-host>/icons/icon__step.svg",
		"total_altitude": null,
		"avg_heartbeat": 133,
		"rpe": 1,
		"comment": null,
		"strava": false,
		"strava_url": null,
		"garmin": true,
		"polar": false,
		"trenara": false,
		"allow_shoe": true,
		"cross_type": null,
		"cross_percentage": null,
		"cross_percentage_min": null,
		"cross_percentage_max": null,
		"ask_feedback": false,
		"distance": "8km",
		"distance_value": 8,
		"distance_unit": "km",
		"distance_unit_text": "km",
		"time": "50:37",
		"time_in_sec": 3037,
		"time_value": 3037,
		"time_unit": "sec",
		"pace": "06:19 min/km",
		"pace_value": 379,
		"pace_unit": "min/km",
		"gps_media": [
			{
				"id": 18221138,
				"path": "https://<cdn-host>/18221138/gps_data_garmin_29442588.json",
				"original_path": "https://<cdn-host>/18221138/gps_data_garmin_29442588.json",
				"meta": {
					"gps": false,
					"time": true,
					"speed": true,
					"points": 639,
					"altitude": false,
					"distance": true,
					"heartbeat": true,
					"compressed": true,
					"normalized": true,
					"integration": "garmin",
					"normalized_version": 1,
					"points_before_compression": 3038,
					"points_before_normalization": 639
				},
				"size_in_kb": 167.952,
				"created_at": 1787587546,
				"custom_properties": { "…": "same object as meta" }
			}
		],
		"notification": { "…": "same object as last_notification" }
	},
	"ask_for_rpe": false,
	"count_open_rpe": 0,
	"featured_challenge": null,
	"energy_value": 18,
	"energy_title": "The energy bar is based on your acute training load.",
	"energy_description": "When the acute load (ATL) goes up compared to your chronic load (CTL, a rolling average), you move towards the red…",
	"last_medals": [
		{
			"id": 192,
			"name": "300 minutes in July",
			"type": "sum_time",
			"achieved_at": "2026-07-23",
			"progress_percentage": 100,
			"target": "05:00:00",
			"target_in_sec": 18000,
			"target_value": 18000,
			"target_unit": "sec",
			"progress": "05:00:00",
			"progress_in_sec": 18000,
			"progress_value": 18000,
			"progress_unit": "sec",
			"description": "Collect 300 minutes of running time this month…",
			"background_color_hex": "#FB2A49",
			"start": "2026-07-01",
			"end": "2026-07-31",
			"button_text": null,
			"url": null,
			"is_participating": true,
			"is_featured": false,
			"is_sponsored": false,
			"is_premium_only": false,
			"message_title": "Yeah! Made it! Congrats!",
			"message": "Great effort, you did it!…",
			"picture": {
				"id": 17706867,
				"path": "https://<cdn-host>/17706867/medal_picture_300min07-2026.png",
				"original_path": "https://<cdn-host>/17706867/medal_picture_300min07-2026.png",
				"meta": null,
				"size_in_kb": 41.047,
				"created_at": 1783499523,
				"custom_properties": []
			}
		}
	],
	"ask_for_review": false,
	"ask_for_review_text": null,
	"status_message": null,
	"sleep_score": null
}
```

Medal `type` seen so far: `sum_time` (target in seconds) and `sum_distance`
(target in km). The distance variant carries `target_unit_text` /
`progress_unit_text` instead of `target_in_sec` / `progress_in_sec`.

---

## PUT /api/entries/{id}/rpe

How hard the session felt, on the ten-step RPE scale. Called by
`trainingApi.putFeedback` behind our own `PUT /api/v1/feedback`, which takes
`{ entryId, feedback }` and sends `{ rpe }` — the rename is ours, and worth
knowing when reading a network log against this file.

`{id}` is an **entry** id — the completed activity — not the scheduled-training
id sitting beside it in the same week payload. The two are different spaces.

### Request

```json
{
	"rpe": 2
}
```

`rpe` is an integer 1–10. `rpeFeedbackSchema` in `src/lib/schemas/feedback.ts`
holds that range on our side; the ten steps and the wording shown against each
live in `rpe-slider.svelte`.

### Notable fields

- **The response is the whole updated entry**, not an acknowledgement — the
  same `Entry` the week payload carries, and the fullest capture of one taken
  so far: `laps[]`, `splits[]` and `shoe` are all present here and all absent
  from the dashboard's `last_entry`. Like the training mutations, a caller can
  patch its copy from the response instead of refetching the week.
- **`shoe` is a complete `Shoe`** — the same object `/api/me/shoes` returns,
  field for field, `lifetime_percentage` float noise included. It was missing
  from our `Entry` type until this capture; `allow_shoe` was there without it,
  which read as though the shoe itself lived somewhere else.
- **`ask_feedback` comes back `false`.** The write retires the prompt in the
  same round trip, so a client that keeps the response does not have to infer
  it from `rpe` no longer being `null`. The dashboard's `count_open_rpe` and
  `ask_for_rpe` are the same signal one level up.
- **`rpe` echoes what was sent**, so the response confirms the value stored
  rather than only that something was stored.
- `notification.metadata` here carries the four training fields
  (`goal_daily_tss`, `goal_pvt_tss`, `done_tss`, `type`) and **nothing else** —
  no `name`, no `goal`, which our `Entry` type had as required. Metadata varies
  by `notification_type`, as `trainingLoad` already assumes; the type says so
  now. `name` and `goal` are what `AddEntryResponse` carries — its notification
  metadata is `{ name, goal, type }` with no load figures at all — so the two
  shapes had been merged into one required set that no capture matches.
- **`notification.server_actionable` is new here.** The `/api/dashboard/`
  capture above, taken a week earlier, has no such field on its
  `last_notification`; whether it is specific to this endpoint or was added
  upstream in between cannot be told from two captures. Typed optional for
  that reason.
- The notification is the one written when the activity synced, not one the
  rating produced: its `created_at` here predates the rating, and its copy is
  about the training. **Nothing in the response is evidence that rating a
  session changes the coach's message.**
- `laps[].pace_percentage` is not a share of anything absolute — it spreads the
  session's own laps across 0–100, fastest lap high and slowest lap low. On
  this capture it tracks `(slowest − pace) / (slowest − fastest)` to within
  three points on every lap, which is why the final lap at 05:22 min/km scores
  `3` while the fastest at 04:59 scores `97`. Inferred from one session, and
  from rounded paces at that; it is not a figure to display as a percentage of
  a target.
- `laps[].altitude` is `0` on every lap while the entry's `total_altitude` is
  `null`. A treadmill run, so absent climb reads as zero per lap and as unknown
  overall — the two are not the same field summed.
- Lap distances are the honest ones (`999m`, `998m`), and `sum_distance` is
  rounded (`9.01km` after nine laps of about a kilometre). The entry's
  `distance_value` of `9.5` is neither: it includes what was run after the last
  full lap.
- `splits` was `[]` here, as in every capture so far. Shape still unknown, and
  still `object[]` in the type.

### Sample response

Seven of the nine laps elided; the two kept and the last are verbatim, and the
shape is identical across all nine.

```json
{
	"id": 29626510,
	"name": "Garmin Treadmill running",
	"start_time": "2026-08-31T18:42:30+02:00",
	"type": "run",
	"icon": "https://<api-host>/icons/icon__step.svg",
	"total_altitude": null,
	"avg_heartbeat": 151,
	"rpe": 2,
	"comment": null,
	"strava": false,
	"strava_url": null,
	"garmin": true,
	"polar": false,
	"trenara": false,
	"allow_shoe": true,
	"cross_type": null,
	"cross_percentage": null,
	"cross_percentage_min": null,
	"cross_percentage_max": null,
	"ask_feedback": false,
	"distance": "9.5km",
	"distance_value": 9.5,
	"distance_unit": "km",
	"distance_unit_text": "km",
	"time": "48:15",
	"time_in_sec": 2895,
	"time_value": 2895,
	"time_unit": "sec",
	"pace": "05:04 min/km",
	"pace_value": 304,
	"pace_unit": "min/km",
	"gps_media": [
		{
			"id": 18293769,
			"path": "https://<cdn-host>/18293769/gps_data_garmin_29626510.json",
			"original_path": "https://<cdn-host>/18293769/gps_data_garmin_29626510.json",
			"meta": {
				"gps": false,
				"time": true,
				"speed": true,
				"points": 757,
				"altitude": false,
				"distance": true,
				"heartbeat": true,
				"compressed": true,
				"normalized": true,
				"integration": "garmin",
				"normalized_version": 1,
				"points_before_compression": 2898,
				"points_before_normalization": 759
			},
			"size_in_kb": 199.614,
			"created_at": 1788197814,
			"custom_properties": { "…": "same object as meta" }
		}
	],
	"notification": {
		"id": 18299227,
		"title": "Training",
		"content": "Consistency brings results, you’re setting a great example.",
		"notification_type": "training",
		"metadata": {
			"goal_daily_tss": 63.5395,
			"goal_pvt_tss": 64,
			"done_tss": 59.882,
			"type": "training_normal"
		},
		"training_id": null,
		"entry_id": 29626510,
		"medal_id": null,
		"created_at": "2026-08-31T19:36:48+02:00",
		"actions": ["share"],
		"server_actionable": false
	},
	"laps": [
		{
			"id": 290648519,
			"order": 0,
			"pace_percentage": 50,
			"heartbeat": 141,
			"altitude": 0,
			"type": "lap",
			"time": "05:02",
			"time_in_sec": 302,
			"time_value": 302,
			"time_unit": "sec",
			"pace": "05:10 min/km",
			"pace_value": 310,
			"pace_unit": "min/km",
			"distance": "1km",
			"distance_value": 1,
			"distance_unit": "km",
			"distance_unit_text": "km",
			"sum_distance": "1km",
			"sum_distance_value": 1,
			"sum_distance_unit": "km",
			"sum_distance_unit_text": "km"
		},
		{
			"id": 290648520,
			"order": 1,
			"pace_percentage": 97,
			"heartbeat": 150,
			"altitude": 0,
			"type": "lap",
			"time": "05:00",
			"time_in_sec": 300,
			"time_value": 300,
			"time_unit": "sec",
			"pace": "04:59 min/km",
			"pace_value": 299,
			"pace_unit": "min/km",
			"distance": "1km",
			"distance_value": 1,
			"distance_unit": "km",
			"distance_unit_text": "km",
			"sum_distance": "2km",
			"sum_distance_value": 2,
			"sum_distance_unit": "km",
			"sum_distance_unit_text": "km"
		},
		{ "…": "six more laps, orders 2 to 7" },
		{
			"id": 290648527,
			"order": 8,
			"pace_percentage": 3,
			"heartbeat": 154,
			"altitude": 0,
			"type": "lap",
			"time": "05:05",
			"time_in_sec": 305,
			"time_value": 305,
			"time_unit": "sec",
			"pace": "05:22 min/km",
			"pace_value": 322,
			"pace_unit": "min/km",
			"distance": "999m",
			"distance_value": 999,
			"distance_unit": "m",
			"distance_unit_text": "m",
			"sum_distance": "9.01km",
			"sum_distance_value": 9.01,
			"sum_distance_unit": "km",
			"sum_distance_unit_text": "km"
		}
	],
	"splits": [],
	"shoe": {
		"id": 4141,
		"brand": "Nike",
		"name": "Invincible Run 3",
		"type": "long_run",
		"preferred": false,
		"buy_date": "2025-10-19",
		"lifetime_percentage": 45.56250000000001,
		"created_at": "2025-10-20T13:22:07+02:00",
		"updated_at": "2025-10-20T13:22:07+02:00",
		"retired_at": null,
		"expected_lifetime_distance": "800km",
		"expected_lifetime_distance_value": 800,
		"expected_lifetime_distance_unit": "km",
		"expected_lifetime_distance_unit_text": "km",
		"distance_done": "364.5km",
		"distance_done_value": 364.5,
		"distance_done_unit": "km",
		"distance_done_unit_text": "km",
		"avg_pace": "05:14 min/km",
		"avg_pace_value": 314,
		"avg_pace_unit": "min/km",
		"picture": null
	}
}
```

---

## GET /api/goal

The current goal: target time and distance, the plan's window, its repeating
week, and the conditions the goal is run under. `Goal` in `types.ts`, read by
`trainingApi.getGoal`.

### When there is no goal

An account with no goal set is not an error, and this endpoint says so twice
over — with the same sentence on two different statuses:

```
HTTP 404
{ "message": "No result found" }
```

```
HTTP 400
{ "message": "No result found." }
```

The 404 was captured first; the 400 came from `/api/goal/` — **with** the
trailing slash — on an account with no goal. Which of the two you get, and
whether the slash is what decides it, has not been established: the sentence is
a semantic answer either way, not a routing error, and a wrong path would not
carry it.

So the status alone cannot be trusted to mean "no goal", and
`isMissingUpstream` in `request.ts` reads **either**: a 404 unconditionally, and
a 400 only when the body carries that sentence — narrow on purpose, because
every other 400 from this API is a request we got wrong, and turning those into
an empty screen would hide the failure this app is least able to notice. Note
the full stop, which appears on one and not the other; the match allows both.

### Notable fields

- `week[]` is the plan's repeating pattern — see `current_goal` under
  `/api/dashboard/` for what the three fields mean. This response and the
  dashboard's embedded copy agree field for field, so the pattern is the same
  object served twice, not two serialisations that might drift.
- **`description` and `updated_at` are not sent.** Our `Goal` type declared
  both as required until this capture; they are optional now, and the goal card
  guards on the description rather than holding an empty paragraph open.
- `time_in_sec` (3360 here) is the target, and the number worth comparing
  against `best_times.time_for_goal` — see `/api/me/stats/`.
- `edit_warning` is copy to show before a change, and is about the team rather
  than the runner: editing a captain's goal changes it for everyone.
- `intermediate_goals[]` was empty here; each entry carries its own distance,
  time, pace and `training_condition`, so a dated milestone is a small goal in
  its own right.
- `training_condition.type` is `"Goal"`, distinguishing it from the per-session
  conditions that share the shape.

### Sample response

Verbatim.

```json
{
	"id": 2123705,
	"name": "15k nocturno",
	"number_of_trainings": 4,
	"week": [
		{ "day": 4, "excel_id": 5, "training_id": 2559 },
		{ "day": 0, "excel_id": 9, "training_id": 2563 },
		{ "day": 2, "excel_id": 3, "training_id": 2557 },
		{ "day": 6, "excel_id": 4, "training_id": 2558 }
	],
	"start_date": "2026-06-29",
	"end_date": "2026-09-27",
	"training_scheme_type": "ultimate",
	"time_type_selected": "trenara_time",
	"overrule_time": false,
	"can_be_edited": true,
	"edit_warning": "Watch out! As troop captain, changing the goal will mean everyone's goal will be changed. Are you sure you want to change it?",
	"created_at": 1782684230,
	"time": "56:00",
	"time_in_sec": 3360,
	"time_value": 3360,
	"time_unit": "sec",
	"distance": "15km",
	"distance_value": 15,
	"distance_unit": "km",
	"distance_unit_text": "km",
	"pace": "03:43 min/km",
	"pace_value": 223,
	"pace_unit": "min/km",
	"intermediate_goals": [],
	"training_condition": {
		"id": 3788086,
		"type": "Goal",
		"height_difference": "flat",
		"surface": "road",
		"intensity": 100,
		"updated_at": 1782684230,
		"height": null,
		"height_value": null,
		"height_unit": null,
		"height_unit_text": null
	}
}
```

---

## DELETE /api/goal

Deletes the current goal, and with it the plan built for it.
`trainingApi.deleteGoal`, behind our own `DELETE /api/v1/goal`.

Takes no path parameter and needs none: an account has one current goal and the
token names the account. Answers:

```json
{ "message": "Success." }
```

Afterwards `GET /api/goal` answers `{"message":"No result found"}` — see
**When there is no goal** above for the two statuses it arrives on. That is the
state the goal page already renders an empty screen for, via
`passthroughOptional`, so there is nothing to seat from the response; the caller
reloads.

**One difference from the capture worth knowing about.** The capture sends a
literal `null` as the request body; `fetchClient.delete` sends no body at all.
A DELETE with no body is what the method means and what the other two deletes in
this file send, so that is what the wrapper does — but the two are not the same
request and the difference has not been tested. If this is ever refused, it is
the first place to look.

Irreversible from this app: nothing here sets a goal, so a runner who deletes
one gets it back only by setting a new one in Trenara. The confirmation dialog
in front of it is not decoration.

---

## Setting a new goal — the init and schemes flow

**Not wired up.** Five endpoints, captured together, that the mobile app walks
through when a runner sets a goal. Recorded here as a set because none of them
means much alone, and because this app cannot currently set a goal at all —
which is why the goal page's empty state points at the Trenara app rather than
offering a form.

The order they are called in:

1. `GET /api/init/suggestion/` — which flow to steer the runner into.
2. `GET /api/init/{flow}/` — what the backend already knows about their running.
3. `POST /api/init/{flow}/` — the benchmark the runner confirms, which
   recalibrates the account.
4. `GET /api/schemes/{flow}/config` — the bounds the goal picker has to obey.
5. `POST /api/schemes/advice` — the goal checked over, and how many sessions a
   week it can be trained on.
6. `GET /api/schemes/{flow}/week` — the session types that week can be built
   from.
7. `POST /api/schemes/{flow}/test/` — the finished goal costed out, and whether
   it is reachable.
8. `POST /api/schemes/{flow}/goal` — the goal confirmed and saved.

Only the `ultimate` flow has been captured. The app names others — build your
own journey, post-race recovery, rebuild fitness, maintenance — and **their wire
values are unknown**: `ultimate` is the only one seen in a URL, so treat `{flow}`
as a path segment whose vocabulary has not been established.

The last two are a pair, in the spirit of `change_test` / `change_save` on a
training move but not in its mechanics: `test/` **writes a draft goal and hands
back its id**, and `goal` confirms that id, changing one field as it does. So
the dry run is not dry — see the note under `test/`.

Steps 5 to 7 repeat. The advice call is re-made as the goal is filled in, and
`test/` is re-run for every revision — a different distance, a different week, a
suggested time accepted — each run leaving its own draft. Only the last id
reaches step 8.

Afterwards the app re-reads `GET /api/me` and `GET /api/goal`: the save answers
with the goal but not with the account, and a new goal moves things on the
account that this app caches. Anything wiring this flow up has to invalidate the
read cache the way every other write here does.

### GET /api/init/suggestion/

Which flow the backend thinks this runner belongs in, and the copy explaining
why. The distance is a suggested benchmark, in the usual formatted / raw / unit
triple.

```json
{
	"suggestion": "ultimate",
	"text": "You seem to have a good training regime already, we suggest the ultimate goal flow to push yourself further.",
	"distance": "10.11km",
	"distance_value": 10.11,
	"distance_unit": "km",
	"distance_unit_text": "km"
}
```

`text` is a whole sentence written for the runner and is safe to show. `suggestion`
is the wire value, and is what picks the `{flow}` segment of the next two calls.

### GET /api/init/{flow}/

The best effort the backend can find in the runner's history, to seed the
calibration with.

```json
{
	"status": "no_init_data_hit",
	"message": "api.split_init_data_hit",
	"best_time_in_sec": 2469,
	"best_entry_name": "Garmin Running",
	"avg_trainings": 2,
	"week_volume": 19,
	"best_distance": "10km",
	"best_distance_value": 10,
	"best_distance_unit": "km",
	"best_distance_unit_text": "km",
	"pace": "14.63 km/h",
	"pace_value": 246,
	"pace_unit": "km/h",
	"best_time": "41:09",
	"best_time_value": 2469,
	"best_time_unit": "sec",
	"previous_calibration_time": 2430
}
```

- **`message` is a translation key, not a sentence.** `"api.split_init_data_hit"`
  is meant to be looked up, and `status` (`"no_init_data_hit"`) is the machine
  half of the same statement. Neither is copy — do not put either on screen.
  Every numeric field is populated regardless, so whatever the status is
  reporting, it is not "nothing was found".
- **`pace_value` is seconds per kilometre although `pace_unit` says `km/h`.**
  246 against a printed `"14.63 km/h"`: 3600 ÷ 14.63 is 246.07, so the number and
  the label describe the same speed in different units and only the label is
  honest about which. Neither quite reconciles with `best_time_in_sec` over
  `best_distance_value` (2469 ÷ 10 = 246.9 s/km, 14.58 km/h), so the pace pair is
  derived from something slightly other than the two fields beside it. Use
  `best_time_in_sec` and `best_distance_value` if the figure matters.
- `best_entry_name` is the name of the run it came from — here an imported
  Garmin activity, so this reads the runner's actual history rather than only
  Trenara-planned sessions.
- `avg_trainings` (per week) and `week_volume` (km) are what the advice call
  later reasons about.
- `previous_calibration_time` is what the last calibration recorded over the
  same distance, so the two are a before-and-after pair: 2430 against a fresh 2469.

### POST /api/init/{flow}/

The benchmark the runner confirms, which is not necessarily the one the GET
suggested — the capture posts `2430` and `10.0`, the _previous_ calibration
time, against a GET that offered 2469 and 10.

```json
{
	"best_distance_value": 10.0,
	"best_time_in_sec": 2430,
	"best_distance_unit": "km",
	"shoe_type": null
}
```

- `shoe_type` is null here and is presumably one of the `SHOE_TYPES` values
  (`supershoe` and friends), so a time set in race shoes can be discounted. No
  capture sets it.
- **Answers with the whole account** — the same shape as `GET /api/me`, `User`
  in `types.ts` — rather than an acknowledgement. So a caller can replace its
  copy of the account from the response.
- The lactate thresholds in that response differ from the ones in the `GET
/api/me` sample below (`pace_lt1_value` 290 and `pace_lt2_value` 242, against
  293 and 245), which is consistent with this call recalibrating them. The two
  captures are from different days, so read that as the likely purpose rather
  than as proof.
- The capture was taken on a paused account, and carries `is_paused: true`,
  `paused_since: 1788213600`, `pause_cause: "other"` — the same three fields
  `POST /api/me/pause/` sets.

The response is not repeated here; it is `GET /api/me`'s sample with those
differences.

### GET /api/schemes/{flow}/config

The bounds the goal picker has to obey. No user data beyond the bounds
themselves.

```json
{
	"min_number_of_trainings": 2,
	"max_number_of_trainings": 7,
	"max_goal_date": 1819749600,
	"min_distance": "4km",
	"min_distance_value": 4,
	"min_distance_unit": "km",
	"min_distance_unit_text": "km",
	"max_distance": "165km",
	"max_distance_value": 165,
	"max_distance_unit": "km",
	"max_distance_unit_text": "km"
}
```

- `max_goal_date` is unix seconds, and in this capture it is **exactly one year
  ahead, at local midnight** — 1819749600 is 2027-09-01 00:00 in CEST, on a
  request made on 2026-09-01. So it is computed per request rather than fixed,
  and it is a date rather than an instant.
- The training counts here (2–7) are a wider range than the ones
  `/api/schemes/advice` offers back for a specific goal (3–7 in that capture),
  so these are the picker's outer bounds and the advice call narrows them.
- 165 km as a maximum distance is not a typo — ultras are in scope.

### POST /api/schemes/advice

The goal, checked over before it is saved: how many sessions a week it can be
trained on, and anything the backend wants to say about it first.

```json
{
	"flow": "ultimate",
	"goal_date": "06/12/26",
	"distance_value": 41.2,
	"distance_unit": "km",
	"time_in_sec": 10800,
	"checked_codes": [],
	"edit_flow": false
}
```

```json
{
	"nr_of_trainings": [3, 4, 5, 6, 7],
	"advices": [
		{
			"code": "two_week_consistency",
			"title": "Training advice",
			"message": "We noticed breaks in your recent training, including two weeks without any runs. After time off, it's important to ease back in and rebuild consistency gradually.\r\n\r\nIf needed, starting with a shorter goal and a manageable training frequency can help support a smooth return. Regular fitness benchmarks help keep your training zones and load aligned with your current fitness as you return to training.",
			"url": null
		}
	]
}
```

- **`checked_codes` is an acknowledgement, not a filter.** Posting the same goal
  again with `"checked_codes": ["two_week_consistency"]` answers with the same
  `nr_of_trainings` and `advices: []`. So the call is re-made after the runner
  has read each advice, carrying the codes back, and an empty `advices` is the
  signal that there is nothing left to show — the gate before the goal is saved.
- **`goal_date` is `DD/MM/YY` — the only date in this file that is not ISO, and
  it is day-first.** Two digits per part settles nothing on its own; the pair of
  captures does. The same goal reaches `POST /api/schemes/{flow}/test/` below as
  `"end_date": "2026-12-06"`, in ISO, against `"06/12/26"` here. So `06` is the
  day, and this endpoint is the one place a date has to be reformatted on the
  way out. Getting it backwards would not be refused — `12/06/26` is a perfectly
  good date — so it is worth a second look at every call site.
- **`number_of_trainings` is sent once the runner has picked one**, and is
  absent before that: the first two captures omit it, a third sends `5` and
  answers with the same `nr_of_trainings` and an empty `advices`. So the call is
  re-made as the goal is filled in, and the field is optional rather than
  required.
- `time_in_sec` is the target time (10800 = 3:00:00) and `distance_value` the
  target distance, so the two are the goal itself rather than anything measured.
- `edit_flow: false` distinguishes setting a first goal from changing an
  existing one. Only `false` has been captured.
- `advices[].message` carries `\r\n\r\n` between paragraphs — Windows line
  endings in JSON, so anything rendering it has to split on them rather than
  assume `\n`. `url` is null here and presumably links to a longer article.
- `title` is `"Training advice"` on the only advice captured — generic, so it is
  probably the same heading for every code rather than a per-advice title.

### GET /api/schemes/{flow}/week

The session types the week can be built from, once the goal and the number of
sessions are settled. Everything is a query parameter:

```
/api/schemes/ultimate/week
	?type=ultimate
	&distance_value=41
	&distance_unit=km
	&number_of_trainings=3
	&time_in_sec=10800
	&selection_typing=true
	&height_difference=flat
	&surface=road
	&height_value=0
	&height_unit=m
```

```json
[
	{
		"id": 2559,
		"copied_value": null,
		"prior": null,
		"name": "LSD",
		"description": "Your longest run of the week, here we work on improving your aerobic capacity.",
		"hex_color": "#44A6D3",
		"selection_type": "mandatory"
	},
	{
		"id": 2557,
		"copied_value": null,
		"prior": null,
		"name": "Intervals",
		"description": "Often the session where you reach the highest speeds. Not necessarily the hardest though, depending on which stimulus we want to give.",
		"hex_color": "#CC3311",
		"selection_type": "recommended"
	},
	{
		"id": 2555,
		"copied_value": null,
		"prior": null,
		"name": "Recovery run",
		"description": "Your slowest run of the week. A bit of a misleading name, as a recovery run also adds something to your training load, of course.",
		"hex_color": "#90CFF1",
		"selection_type": "optional"
	}
]
```

A bare array, not an envelope. Three of the seven entries are shown above; the
full capture returned, in served order: Recovery run (optional), Endurance run
(optional), Intervals (recommended), Tempo run (recommended), LSD (mandatory),
a second Endurance run (optional) and Easy run + strides (mandatory).

- **This is the menu, not the week.** `number_of_trainings=3` went out and seven
  entries came back, two of them `mandatory`. So the response is the catalogue
  the runner picks from, ranked by `selection_type` — `mandatory`,
  `recommended`, `optional` — and the count is a constraint the client enforces
  rather than a length the server honours.
- **`id` is the identity, and nothing else is.** Two entries are both named
  "Endurance run" with different ids, and one of them shares its `hex_color`
  with the LSD entry. Do not key off the name or the colour.
- The terrain parameters are the same vocabulary as
  `POST /api/schedule/trainings/{id}/training_condition` — `surface=road`,
  `height_difference=flat`, and the `height_value`/`height_unit` pair — so the
  goal is set against a stated terrain from the start, and the values recorded
  for that endpoint apply here.
- `distance_value=41` against the `41.2` sent to `/api/schemes/advice`: this
  capture rounded. Whether the endpoint accepts a fraction is untested.
- `selection_typing=true` presumably switches on the `selection_type` field,
  since without it there would be nothing to rank by. Not confirmed — no capture
  omits it.
- `type` duplicates the `{flow}` path segment. Sending only one of them has not
  been tried.
- `copied_value` and `prior` are null on every entry and their purpose is
  unknown. `prior` shares its name with `hr_prior`/`heartbeat_prior` on the
  account, which is unlikely to be a coincidence, but nothing here shows what it
  does.
- `description` is written for the runner and `hex_color` is the swatch to draw
  it with; both are ready to show as they are.

### POST /api/schemes/{flow}/test/

The goal as composed so far, costed out: the plan it produces, whether it is
reachable, and what the backend thinks the runner could actually run.

**Called once per revision, not once per goal.** Two captures exist for one
goal, and the second is the first re-composed: `time_in_sec` 10800 the first
time, then 9517 — the `possible_time` the first call answered with — when the
runner took the suggestion. Each call writes its own draft row (2206723, then
2206728), and it is the _second_ id the save then confirms. The request below is
the first of the two.

```json
{
	"name": "Valencia 42k",
	"number_of_trainings": 5,
	"distance_value": 41.2,
	"distance_unit": "km",
	"time_in_sec": 10800,
	"end_date": "2026-12-06",
	"week": [
		{ "day": 1, "training_id": 2557 },
		{ "day": 2, "training_id": 2563 },
		{ "day": 5, "training_id": 2559 },
		{ "day": 4, "training_id": 2558 },
		{ "day": 6, "training_id": 2555 }
	],
	"training_condition": {
		"height_difference": "flat",
		"surface": "road",
		"height_value": 0.0,
		"height_unit": "m"
	},
	"intermediate_goals": []
}
```

```json
{
	"goal": {
		"id": 2206723,
		"name": "Valencia 42k",
		"number_of_trainings": 5,
		"week": [
			{ "day": 1, "training_id": 2557, "excel_id": 3 },
			{ "day": 2, "training_id": 2563, "excel_id": 9 },
			{ "day": 5, "training_id": 2559, "excel_id": 5 },
			{ "day": 4, "training_id": 2558, "excel_id": 4 },
			{ "day": 6, "training_id": 2555, "excel_id": 1 }
		],
		"start_date": "2026-08-31",
		"end_date": "2026-12-06",
		"training_scheme_type": "ultimate",
		"time_type_selected": "my_time",
		"overrule_time": false,
		"can_be_edited": true,
		"edit_warning": "Watch out! As troop captain, changing the goal will mean everyone's goal will be changed. Are you sure you want to change it?",
		"created_at": 1788254879,
		"time": "02:59:54",
		"time_in_sec": 10794,
		"time_value": 10794,
		"time_unit": "sec",
		"distance": "41.2km",
		"distance_value": 41.2,
		"distance_unit": "km",
		"distance_unit_text": "km",
		"pace": "04:21 min/km",
		"pace_value": 261,
		"pace_unit": "min/km",
		"intermediate_goals": [],
		"training_condition": {
			"id": 3837337,
			"type": "Goal",
			"height_difference": "flat",
			"surface": "road",
			"intensity": 100,
			"updated_at": 1788254879,
			"height": null,
			"height_value": null,
			"height_unit": null,
			"height_unit_text": null
		}
	},
	"goal_possible": true,
	"possible_time": 9517
}
```

The second capture is the same goal with the suggested time taken. Only what
differs is shown — everything else in it is identical to the above, including
the week, the dates and the terrain:

```json
// request
{ "time_in_sec": 9517 }

// response
{
	"goal": {
		"id": 2206728,
		"time_type_selected": "my_time",
		"time": "02:38:37",
		"time_in_sec": 9517,
		"pace": "03:50 min/km",
		"pace_value": 230,
		"created_at": 1788255098,
		"training_condition": { "id": 3837340, "updated_at": 1788255098 }
	},
	"goal_possible": true,
	"possible_time": 9475
}
```

- **`goal_possible` and `possible_time` are the answer; the goal is the
  receipt.** `possible_time` is 9517 (2:38:37) against the 10800 (3:00:00) that
  was asked for — the backend's read of what this runner could do over the
  distance, and here it is _faster_ than the target rather than a correction
  downwards. So the pair is a comparison to show the runner, not a rejection:
  `goal_possible` is what gates saving.
- **`time_type_selected` is `"my_time"` on both captures**, including the one
  whose `time_in_sec` is Trenara's own suggested figure copied back in. So this
  call has no way of knowing which of the two the number came from — every
  request carries an explicit time, and it records them all as the runner's. The
  save call below is what sets the field to `"trenara_time"`, and it does so as
  a label rather than by changing anything.
- **`possible_time` moves with the goal you ask for.** 9517 against a requested
  10800; then 9475 against a requested 9517. So it is not a fixed read on the
  runner — asking for less brings the estimate down with it, and re-running this
  call chasing the figure would not converge on anything meaningful. Treat it as
  a comparison against the goal in hand, which is the only thing either capture
  supports.
- **The time is snapped to a whole second per kilometre, and the pace is then
  truncated below it.** Two captures fix the rule: the time asked for is divided
  by the distance, **rounded** to a whole second per km, and multiplied back,
  truncated. 10800 ÷ 41.2 = 262.14 → 262 → 10794.4 → **10794**; 9517 ÷ 41.2 =
  230.99 → 231 → 9517.2 → **9517**, which is why the second capture looks
  untouched and is not. `pace_value` is then `floor(time ÷ distance)` — 261 and
  230 — landing a second per km _below_ the pace the time was built from in both,
  and the printed `pace` truncates the same way (`"04:21 min/km"` for 261.99 s).
  So the time, the pace and the printed pace disagree by design; do not assume
  any of the three echoes what was sent.
- **`week[]` is not in day order and does not need to be.** The request sends
  days 1, 2, 5, 4, 6 and the response echoes that order; `day` carries the
  meaning. `training_id` is an `id` from `GET /api/schemes/{flow}/week`, and
  `number_of_trainings` matches the array's length.
- The response adds an **`excel_id`** to each week entry, which the goal's own
  sessions carry too — see `goal_pvt_tss` under `/api/dashboard/`, where the
  round-numbered load figure and this id together suggest a coach's spreadsheet
  behind the plan. It is assigned here, not sent.
- `start_date` is the backend's, not the client's: `2026-08-31` on a request
  made on 2026-09-01 — the Monday of the current week. Only `end_date` is asked
  for.
- **`end_date` is ISO here** (`"2026-12-06"`), unlike the `goal_date` that
  `/api/schemes/advice` takes for the same goal (`"06/12/26"`). Two endpoints in
  one flow, two date formats.
- `training_condition` goes up with `height_value: 0.0` and `height_unit: "m"`
  and comes back with `height`, `height_value` and `height_unit` all null — the
  zeros are dropped rather than stored, the same way they are on
  `POST /api/schedule/trainings/{id}/training_condition`. `intensity: 100` and
  `type: "Goal"` are assigned by the backend.
- `name` is free text the runner types, and `intermediate_goals` was empty in
  the capture. `edit_warning` is the same team copy `GET /api/goal` carries.

**This is not a dry run, whatever it is called.** The response is a fully formed
goal with an `id`, a `created_at` and a `training_condition` carrying its own
`id` and `updated_at` — and `POST /api/schemes/{flow}/goal` below then takes
that `id` as its `goal_id`. So the row exists after this call and the save
confirms it; the two ids captured are different (2206723 here, 2206728 in the
save), which is two runs of `test/` and therefore **two rows for one goal**.

Anything calling this has to reckon with that, and the two captures are the
proof rather than a worry about one: composing this single goal twice left rows
2206723 and 2206728, of which only the second was ever confirmed. Nothing
captured so far cleans up the first. Every revision the runner makes — a
distance nudged, a session moved, a suggested time accepted — is another row.
`change_test` on a training move is a genuine dry run; this shares its naming
and not its behaviour.

### POST /api/schemes/{flow}/goal

Confirms the draft the last `test/` left behind, and makes it the current goal.
The end of the flow.

**It changes exactly one field.** Set the draft from `test/` beside this
response and `time_type_selected` is the only difference in the whole object —
`my_time` becomes `trenara_time`. Same `id`, same `created_at` (1788255098 in
both), same `time_in_sec` of 9517 and the same `pace_value` of 230, same
`training_condition` down to its `id` and `updated_at`. The goal was already
composed; this promotes the row.

```json
{
	"goal_id": 2206728,
	"trenara_time": true,
	"overrule_time": false,
	"advice_codes": ["two_week_consistency"]
}
```

The response is a bare `Goal` — the same shape `GET /api/goal` serves, with no
envelope around it:

```json
{
	"id": 2206728,
	"name": "Valencia 42k",
	"number_of_trainings": 5,
	"week": [
		{ "day": 1, "excel_id": 3, "training_id": 2557 },
		{ "day": 2, "excel_id": 9, "training_id": 2563 },
		{ "day": 5, "excel_id": 5, "training_id": 2559 },
		{ "day": 4, "excel_id": 4, "training_id": 2558 },
		{ "day": 6, "excel_id": 1, "training_id": 2555 }
	],
	"start_date": "2026-08-31",
	"end_date": "2026-12-06",
	"training_scheme_type": "ultimate",
	"time_type_selected": "trenara_time",
	"overrule_time": false,
	"can_be_edited": true,
	"edit_warning": "Watch out! As troop captain, changing the goal will mean everyone's goal will be changed. Are you sure you want to change it?",
	"created_at": 1788255098,
	"time": "02:38:37",
	"time_in_sec": 9517,
	"time_value": 9517,
	"time_unit": "sec",
	"distance": "41.2km",
	"distance_value": 41.2,
	"distance_unit": "km",
	"distance_unit_text": "km",
	"pace": "03:50 min/km",
	"pace_value": 230,
	"pace_unit": "min/km",
	"intermediate_goals": [],
	"training_condition": {
		"id": 3837340,
		"type": "Goal",
		"height_difference": "flat",
		"surface": "road",
		"intensity": 100,
		"updated_at": 1788255098,
		"height": null,
		"height_value": null,
		"height_unit": null,
		"height_unit_text": null
	}
}
```

- **The body is four fields and a reference.** Nothing about the goal is
  re-sent: `goal_id` is the `goal.id` from the last `test/`, and the distance,
  the week, the dates, the terrain _and the time_ all come from that draft. So a
  client cannot change anything here at all — every revision, the time included,
  goes through another `test/` and another draft row.
- **`trenara_time: true` records a choice already made; it does not apply one.**
  The draft it confirms was _already_ at 9517, because the runner took the
  suggestion by re-running `test/` with that figure. The saved goal is 9517 too —
  and notably **not** the 9475 that same `test/` call offered as its new
  `possible_time`, which is the reading to check this against: if the flag
  applied a time, the goal would have come back at 9475. It did not. All the
  flag does is set `time_type_selected`.
- Which leaves the field a claim the backend takes on trust rather than a fact
  it derives — nothing in the draft distinguishes a time the runner typed from
  one they copied out of `possible_time`, so a client that sent `true` on a
  hand-typed goal would have it recorded as Trenara's. Sending `false` presumably
  yields `my_time`; no capture does.
- `pace_value` truncates here too: 9517 ÷ 41.2 is 230.99, stored as 230 and
  printed as `"03:50 min/km"`. Same rounding as the draft, one field further on.
- **`advice_codes` is `checked_codes` under another name.** The same values that
  `POST /api/schemes/advice` takes as `checked_codes` are sent here as
  `advice_codes`, so the acknowledgement is repeated at the point of saving
  rather than carried over. Two names for one list, in one flow.
- `overrule_time` is sent and echoed, and was `false` in every capture. It is
  distinct from `trenara_time` — which time to use is one question, overruling
  it is evidently another — and what it overrules has not been established.
- `created_at` and the `training_condition`'s `id` and `updated_at` are the
  draft's, unchanged — the row is not re-created here, which is the other half of
  the evidence that `test/` is what wrote it.
- The goal's own `id` is the `goal_id` that went in, so the draft is promoted
  rather than copied.

---

## GET /api/me

The account: profile, units, premium state, integration flags, lactate
thresholds, notification settings and teams.

Used by `userApi.getCurrentUser`, typed as `User` in `src/lib/server/trenara/types.ts`.
The fields below went undeclared for a long time and are the ones worth knowing
about, since none of them appear anywhere in the UI yet:

| Field                                                          | Notes                                                                                                                                     |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `uuid`                                                         | stable public id, distinct from the numeric `id`                                                                                          |
| `uses_pace_per_hour`                                           | picks `pace` vs. `pace_per_hour` in training blocks                                                                                       |
| `weight_unit_lang`, `height_unit_lang`                         | spelled-out unit names (`"kilograms"`)                                                                                                    |
| `hr_prior`, `hr_lt1`, `hr_lt2`                                 | heart-rate thresholds (null when uncalibrated)                                                                                            |
| `has_pace_lts`, `pace_lt1_*`, `pace_lt2_*`                     | pace thresholds; `*_value` is sec/km, `*_unit` is `"sec_km"`, `*_unit_trans` is the label                                                 |
| `has_expired_trial`, `premium_trial`, `premium_trial_reminder` | trial state                                                                                                                               |
| `is_paused`, `paused_since`, `pause_cause`                     | the plan pause set by `POST /api/me/pause/`; `paused_since` is unix seconds at local midnight, `pause_cause` a `pause_types[]` wire value |
| `trainer`, `coupled_trainees`, `max_trainees`                  | coach-account fields, null for normal users                                                                                               |
| `notification_settings[]`                                      | per-channel toggles, some with a time                                                                                                     |
| `captains_team`, `teams[]`, `teams_awaiting_approval[]`        | team membership                                                                                                                           |

All of them are declared now. What is left is finding them a screen: the
thresholds explain how a session is scored, and the notification and team
blocks are settings UI waiting to happen.

- `notification_settings[]` — `type` is the wire key (`global`,
  `training_reminder`, `feedback`, `strength`, `scheme`, `calibration`, `rpe`,
  `sleep`), `checked` the toggle, and `allow_time` says whether `time`
  (`"HH:MM"`) applies. `global` gates all the others.
- `premium_platform` values seen: `"b2b"`. With `premium_auto_renew: false` and
  a `premium_until` unix seconds, that is a company-paid subscription rather
  than a store subscription.
- `is_ultimate` / `is_starter` describe the plan tier the user trains on
  (matches `training_scheme_type` on the goal), not the payment tier.
- Team objects repeat in full inside `captains_team` and `teams[]`; the same
  team appears in both when the user is its captain. `join_code` is the invite
  code — treat it as a secret in logs and screenshots.

### Sample response

Identifiers redacted; otherwise verbatim.

```json
{
	"id": 56540,
	"uuid": "00000000-0000-0000-0000-000000000000",
	"first_name": "Nils",
	"last_name": "Beckmann",
	"email": "user@example.com",
	"gender": "m",
	"location": null,
	"country": null,
	"date_of_birth": "1985-07-29",
	"uses_imperial": false,
	"uses_pace_per_hour": false,
	"active_measurement_system": "Metric",
	"preferred_distance_unit_small": "m",
	"preferred_distance_unit_small_text": "m",
	"preferred_distance_unit_large": "km",
	"preferred_distance_unit_large_text": "km",
	"weight": 69,
	"weight_unit": "kg",
	"weight_unit_lang": "kilograms",
	"height": 188,
	"height_unit": "cm",
	"height_unit_lang": "centimeters",
	"nationality_id": 276,
	"account_created_at": 1682878644,
	"heartbeat_prior": false,
	"turnaround_heartbeat": null,
	"hr_prior": false,
	"hr_lt1": null,
	"hr_lt2": null,
	"has_pace_lts": false,
	"pace_lt1_value": 293,
	"pace_lt1_unit": "sec_km",
	"pace_lt1_unit_trans": "min/km",
	"pace_lt2_value": 245,
	"pace_lt2_unit": "sec_km",
	"pace_lt2_unit_trans": "min/km",
	"is_ultimate": true,
	"is_starter": false,
	"weekly_trainings": 4,
	"can_set_goal": true,
	"has_strava": false,
	"has_garmin_import": true,
	"has_garmin_export": true,
	"has_polar": false,
	"has_premium": true,
	"has_right_on_free_trial": false,
	"has_expired_trial": false,
	"premium_trial": false,
	"premium_trial_reminder": false,
	"premium_type": "pro",
	"premium_until": 1808761078,
	"premium_total_time": "4 years ",
	"premium_platform": "b2b",
	"premium_auto_renew": false,
	"is_trainee": false,
	"trainer_picture_url": "https://<api-host>/img/<coach>.png",
	"is_trainer": false,
	"qr_code_url": null,
	"coupled_trainees": null,
	"max_trainees": null,
	"can_create_team": false,
	"can_join_team": true,
	"is_paused": false,
	"paused_since": null,
	"pause_cause": null,
	"strength_calibrated": false,
	"strength_calibration_notification_at": null,
	"has_nutritional_coach": true,
	"profile_picture": {
		"id": 12356744,
		"path": "https://<cdn-host>/12356744/profile_picture.jpg",
		"original_path": "https://<cdn-host>/12356744/profile_picture.jpg",
		"meta": null,
		"size_in_kb": 351.536,
		"created_at": 1740086660,
		"custom_properties": []
	},
	"nationality": {
		"id": 276,
		"name": "Germany",
		"flag": "🇩🇪",
		"region": "Europe",
		"subregion": "Western Europe",
		"demonym": "German",
		"start_of_week": "monday"
	},
	"trainer": null,
	"notification_settings": [
		{
			"type": "global",
			"checked": true,
			"title": "Global notifications",
			"icon_path": "https://<api-host>/icons/icon_bell.svg",
			"allow_time": false,
			"time": null
		},
		{
			"type": "training_reminder",
			"checked": true,
			"title": "Set running reminder",
			"icon_path": "https://<api-host>/icons/icon_bell.svg",
			"allow_time": true,
			"time": "10:00"
		},
		{
			"type": "feedback",
			"checked": true,
			"title": "Feedback messages",
			"icon_path": "https://<api-host>/icons/icon_bell.svg",
			"allow_time": false,
			"time": null
		},
		{
			"type": "strength",
			"checked": true,
			"title": "Set strength reminder",
			"icon_path": "https://<api-host>/icons/icon_bell.svg",
			"allow_time": true,
			"time": "07:30"
		},
		{
			"type": "scheme",
			"checked": true,
			"title": "Training plan notifications",
			"icon_path": "https://<api-host>/icons/icon_bell.svg",
			"allow_time": false,
			"time": null
		},
		{
			"type": "calibration",
			"checked": true,
			"title": "Calibration notifications",
			"icon_path": "https://<api-host>/icons/icon_bell.svg",
			"allow_time": false,
			"time": null
		},
		{
			"type": "rpe",
			"checked": true,
			"title": "RPE notifications",
			"icon_path": "https://<api-host>/icons/icon_bell.svg",
			"allow_time": false,
			"time": null
		},
		{
			"type": "sleep",
			"checked": false,
			"title": "Sleep score notifications",
			"icon_path": "https://<api-host>/icons/icon_bell.svg",
			"allow_time": false,
			"time": null
		}
	],
	"captains_team": {
		"id": 470,
		"name": "Valencia 42k",
		"awaiting_approval": false,
		"status_update": null,
		"nr_of_members": 2,
		"nr_of_members_activated": 1,
		"scheme_activated": true,
		"user_is_captain": true,
		"invite_received_at": null,
		"member_since": 1759420730,
		"created_at": 1759420730,
		"nr_of_waiting_members": 0,
		"join_code": "REDACTED",
		"captain": {
			"id": 56540,
			"name": "Nils Beckmann",
			"profile_picture": { "…": "same shape as profile_picture above" }
		},
		"picture": null
	},
	"teams": [{ "…": "same object as captains_team" }],
	"teams_awaiting_approval": []
}
```

---

## PUT /api/me

Writes the profile: name, e-mail, date of birth, nationality, gender, units,
weight and height — plus, optionally, the lactate thresholds. Everything else
the account carries (premium state, teams, notification settings, integration
flags) is read-only here.

Used by `userApi.updateProfile`, body typed as `ProfileUpdate` in
`src/lib/server/trenara/types.ts`. Nothing in the app calls it yet.

**The body is not a `Partial<User>`.** It is a differently-shaped subset: the
thresholds go flat (`pace_lt1_value` + `pace_lt1_unit`) — the same names the
read side answers with, but only these few of the account's fields are
writable — and the derived read-side labels (`weight_unit_lang`,
`pace_lt1_unit_trans`, `active_measurement_system`) are not sent.

### Request

Both captures send the profile block **whole**, so a partial write is untested
— assume it blanks what it omits until someone tries it. The threshold block is
the only part seen to come and go.

```json
{
	"email": "user@example.com",
	"first_name": "Nils",
	"last_name": "Beckmann",
	"date_of_birth": "1985-07-29",
	"nationality_id": 276,
	"gender": "m",
	"uses_imperial": false,
	"weight": 73.0,
	"weight_unit": "kg",
	"height": 188.0,
	"height_unit": "cm"
}
```

With the thresholds, four more fields and the flag that ranks them against
heart rate:

```json
{
	"…": "same eleven fields as above",
	"hr_prior": false,
	"pace_lt1_value": 291,
	"pace_lt1_unit": "sec_km",
	"pace_lt2_value": 244,
	"pace_lt2_unit": "sec_km"
}
```

### Notable fields

- `weight` and `height` are sent as floats (`73.0`) and come back as JSON
  integers (`73`) — the backend does not preserve the notation, so do not
  round-trip on string equality.
- `weight_unit`/`height_unit` are sent alongside the values rather than
  inferred from `uses_imperial`. Only `"kg"` and `"cm"` have been captured;
  what the imperial pair sends is unknown.
- `pace_lt*_value` is seconds per kilometre when `pace_lt*_unit` is
  `"sec_km"` — 291 is 4:51 min/km. LT1 is the slower of the two.
- `hr_prior` decides whether heart-rate thresholds outrank pace ones. It is
  sent with the pace block even when false.
- `nationality_id` is the id alone; the response expands it into the full
  `nationality` object.

### Response

The complete user object — byte for byte the shape of `GET /api/me`, with the
written values applied. Worth using directly: a successful write can replace a
cached `getCurrentUser` result rather than triggering a re-fetch.

Two things the response does **not** do:

- `has_pace_lts` stays `false` after a write that sets both pace thresholds,
  while `pace_lt1_value` / `pace_lt2_value` come back with the new numbers. So
  the flag does not mean "thresholds are set" — read the values, and do not
  gate threshold UI on it.
- Nothing echoes which fields were accepted. A field the backend ignores is
  indistinguishable from one it applied, except by comparing the response's
  values with what was sent.

---

## POST /api/me/pause/

Pauses the plan, with the reason behind it. `userApi.pausePlan`, behind our own
`POST /api/v1/goal/pause`.

Filed under the account rather than under the goal, which is where the state is
read back from too: `is_paused`, `paused_since` and `pause_cause` on
`GET /api/me`, not on `GET /api/goal`. The **trailing slash is written here
because it was captured here** — see the conventions at the top of this file.

```json
{
	"type": "other",
	"extra_input": ""
}
```

- `type` is a wire value from `pause_types[]` in `/api/config/app` — `illness`,
  `injury`, `holiday`, `motivation`, `other` at the time of capture, and the
  served list is the source of truth rather than that five. Nothing in this app
  validates against a fixed list, for exactly that reason.
- `extra_input` is the free-text follow-up for the reasons `ask_extra_input`
  marks. **It is sent on every request, empty string included**, because the
  capture that established this shape carried it — omitting a blank field is the
  kind of tidying a reverse-engineered endpoint refuses.
- Whether the backend itself requires words for a reason flagged
  `ask_extra_input` has not been established. The app requires them anyway: a
  pause filed as "Other" with nothing after it tells a coach less than not
  filing it at all.

### Response

**The whole account** — the same shape `GET /api/me` serves, `User` in
`types.ts` — with the three pause fields already set, rather than an
acknowledgement. The same convention `PUT /api/me` and `POST /api/init/{flow}/`
follow. Not repeated here; it is `GET /api/me`'s sample with:

```json
{
	"is_paused": true,
	"paused_since": 1788213600,
	"pause_cause": "other"
}
```

- **`pause_cause` is the `type` that was sent**, stored verbatim — so it is a
  `pause_types[]` wire value on the way back too, and needs the served list to
  label it. `$lib/utils/pause` does that, and humanises a value the list does
  not know about rather than printing a bare token.
- **`paused_since` is a date, not an instant.** A pause set during the morning
  of 2026-09-01 came back as 1788213600 — local midnight that day, not the
  moment of the request. So it says which day the pause began and nothing
  finer; do not render a time from it.
- `extra_input` is not echoed anywhere in the account. Whatever the coach sees
  it through, it is not readable from here.

Because the response is the new state, a caller that only wanted to know
whether the pause took does not need a second read. `pausePlan` still drops the
whole read cache: the weeks, the stats and the goal are all affected by a pause
and none of them is in this body.

**No resume endpoint has been captured.** Nothing here can unpause a plan, which
is why the goal page states the paused state and points at the Trenara app
rather than offering a button. Finding that endpoint is what a resume control
waits on.

---

## GET /api/me/stats/

Everything the stats screen shows: personal bests, three flat stat cards, and
two bar-chart series (this week by day, whole goal by week).

Used by `userApi.getUserStats` — note our client calls it **without** the
trailing slash and it answers either way. Typed as `UserStats`, and this
capture matches that type field for field.

### Notable fields

- `best_times` — predicted/achieved bests for 5 km, 10 km, half, marathon, plus
  `*_for_goal` for the current goal distance. Strings only, no raw values;
  `distance_unit` and `pace_unit` at the top say how they are formatted.
  Time strings are `HH:MM:SS`. `time_for_goal` is what the runner is currently
  predicted to do over the goal distance, not what the goal asks: here 01:03:12
  against a `current_goal.time_in_sec` of 3360 (56:00), so the gap between the
  two is the live read on whether the goal is in reach. Parsing it means
  parsing strings — nothing in this block ships a raw value.
  - **The whole block is one number.** Every figure in this capture lies on a
    single Riegel curve, `T2 = T1 * (D2/D1)^e`, at e = 1.0710-1.0713: 5 km
    19:29, 10 km 40:56, 15 km 1:03:12, half 1:31:04, marathon 3:11:18. So these
    are not five predictions but one fitness estimate rendered at five
    distances, and any one of them converts to any other. Practically: trend
    the 10 km series (stable across goal changes, which is why the app records
    it) and map to the goal distance, rather than trending `time_for_goal`
    through a goal switch. The same conversion sizes the ask — 56:00 over 15 km
    is a 36:16 10 km, against 40:56 predicted, so 12.9% of improvement.
- `flat_stats[]` — display-ready cards (`Speed`, `Distance`, `Time`), each a
  title, a PNG icon URL, and `data[]` of title/value strings. Everything is
  pre-formatted (`"4686.04km"`, `"17d 11h"`), so it renders but does not
  compute.
- `graph_stats.weeks` — the current week, one entry per day, `order` 0-6
  starting at the user's `start_of_week`. `done` is what was run, `todo` what
  the plan asked; both `null` on a rest day, and `done` stays `null` for days
  that have not happened yet. Week totals sit alongside `data[]`.
- `graph_stats.goal` — the same done/todo pair per ISO `week` across the whole
  goal, with `month`/`year` labels for axis grouping and `is_current_week` for
  the highlight. Weeks already past with nothing run keep `done: null` rather
  than `0`, which is why the type has to allow null instead of defaulting.
  A null is not evidence of a missed week either — a pause, a holiday or an
  unsynced watch look the same from here; check the week's entries before
  calling it non-compliance.
  - **The totals are not the sum of `data[]`.** This capture's twelve weeks add
    to 564.57 km against a stated `todo` of 595.36; the goal starts 2026-06-29,
    ISO week 27, and the array starts at 28, so the missing 30.79 km is that
    first week. Read the totals the response gives rather than adding the rows.
    - And the difference is not always in that direction. A second capture, on a
      goal saved minutes earlier, states a `todo` of 96.73 against rows adding
      to 106.22 — **9.49 km less than its own rows**, which is exactly the
      session planned for the day of the request. One capture is not a rule, but
      it rules out "the total is the rows plus what the array omits": here the
      total is the rows minus something. Adding the rows yourself is wrong in
      both captures, differently.
  - **A newly saved goal is mostly empty here, and that is not a missing plan.**
    In the capture above, taken just after `POST /api/schemes/{flow}/goal`, the
    goal series runs fourteen weeks (36 to 49) and only the first two carry a
    `todo` at all; twelve are null on both figures. The plan is evidently filled
    in as it goes rather than laid out to the goal date at save time, so a chart
    drawn from this in the first minutes of a goal has almost nothing to draw —
    which is a state to render deliberately, not a response to treat as broken.
    It is also a third reason a null appears here, alongside the pause and the
    unsynced watch above.
  - `graph_stats.goal.done` was **null in that same capture while its own week
    36 carried `done: 9.5`**, and `graph_stats.weeks.done` agreed with the week
    rather than the goal. So the goal-level `done` is not a sum of the rows
    either, and on a fresh goal it can be null while runs have already been
    recorded against it. Take the week series for anything about this week.
  - It is the whole plan, future weeks included, which makes it the cheap way
    to see where a plan gets hard before it does: week-on-week ramp is a
    subtraction away (this capture jumps +46% into its 64.1 km peak, and +50%
    again out of a down week). Kilometres under-count interval weeks, so for
    load rather than volume, price the blocks from `/api/schedule/week/` with
    the same rTSS arithmetic that reproduces `done_tss`.
- Every quantity appears four times: formatted (`done`), raw (`done_value`),
  unit tag (`done_unit`), and unit label (`done_unit_text`). Chart maths uses
  `*_value`; labels use the formatted string, so imperial accounts stay correct
  without converting anything ourselves.

### Sample response

Week and goal series truncated to a few entries each; shapes are identical
across the rest.

```json
{
	"best_times": {
		"distance_unit": "km",
		"pace_unit": "min/km",
		"pace_for_5": "03:53 min/km",
		"time_for_5": "00:19:29",
		"pace_for_10": "04:05 min/km",
		"time_for_10": "00:40:56",
		"pace_for_half_marathon": "04:18 min/km",
		"time_for_half_marathon": "01:31:04",
		"pace_for_marathon": "04:32 min/km",
		"time_for_marathon": "03:11:18",
		"pace_for_goal": "04:12 min/km",
		"time_for_goal": "01:03:12"
	},
	"flat_stats": [
		{
			"title": "Speed",
			"icon": "https://<api-host>/img/stats/stats_speed.png",
			"data": [{ "title": "Average pace", "value": "05:21 min/km" }]
		},
		{
			"title": "Distance",
			"icon": "https://<api-host>/img/stats/stats_distance.png",
			"data": [
				{ "title": "All time", "value": "4686.04km" },
				{ "title": "This week", "value": "8km" },
				{ "title": "Last week", "value": "53.8km" }
			]
		},
		{
			"title": "Time",
			"icon": "https://<api-host>/img/stats/stats_time.png",
			"data": [
				{ "title": "Total running time", "value": "17d 11h" },
				{ "title": "Total sporting time", "value": "20d 18h" }
			]
		}
	],
	"graph_stats": {
		"weeks": {
			"data": [
				{
					"order": 0,
					"day": "monday",
					"date": "24/08",
					"is_today": true,
					"done": "8km",
					"done_value": 8,
					"done_unit": "km",
					"done_unit_text": "km",
					"todo": "9.65km",
					"todo_value": 9.65,
					"todo_unit": "km",
					"todo_unit_text": "km"
				},
				{
					"order": 1,
					"day": "tuesday",
					"date": "25/08",
					"is_today": false,
					"done": null,
					"done_value": null,
					"done_unit": null,
					"done_unit_text": null,
					"todo": null,
					"todo_value": null,
					"todo_unit": null,
					"todo_unit_text": null
				},
				{
					"order": 2,
					"day": "wednesday",
					"date": "26/08",
					"is_today": false,
					"done": null,
					"done_value": null,
					"done_unit": null,
					"done_unit_text": null,
					"todo": "6.78km",
					"todo_value": 6.78,
					"todo_unit": "km",
					"todo_unit_text": "km"
				}
			],
			"done": "8km",
			"done_value": 8,
			"done_unit": "km",
			"done_unit_text": "km",
			"todo": "36.94km",
			"todo_value": 36.94,
			"todo_unit": "km",
			"todo_unit_text": "km"
		},
		"goal": {
			"data": [
				{
					"week": 28,
					"order": 0,
					"month": "July",
					"year": 2026,
					"is_current_week": false,
					"done": "9.18km",
					"done_value": 9.18,
					"done_unit": "km",
					"done_unit_text": "km",
					"todo": "34.24km",
					"todo_value": 34.24,
					"todo_unit": "km",
					"todo_unit_text": "km"
				},
				{
					"week": 32,
					"order": 4,
					"month": "August",
					"year": 2026,
					"is_current_week": false,
					"done": null,
					"done_value": null,
					"done_unit": null,
					"done_unit_text": null,
					"todo": "64.1km",
					"todo_value": 64.1,
					"todo_unit": "km",
					"todo_unit_text": "km"
				},
				{
					"week": 35,
					"order": 7,
					"month": "August",
					"year": 2026,
					"is_current_week": true,
					"done": "8km",
					"done_value": 8,
					"done_unit": "km",
					"done_unit_text": "km",
					"todo": "36.94km",
					"todo_value": 36.94,
					"todo_unit": "km",
					"todo_unit_text": "km"
				}
			],
			"done": "159.69km",
			"done_value": 159.69,
			"done_unit": "km",
			"done_unit_text": "km",
			"todo": "595.36km",
			"todo_value": 595.36,
			"todo_unit": "km",
			"todo_unit_text": "km"
		}
	}
}
```

---

## POST /api/schedule/trainings/{id}/training_condition

Sets the terrain a training is run on. **POST, not PUT** — the odd one out
among the training mutations, which are otherwise all PUT.

Called by `trainingApi.setTrainingCondition`. Like every training mutation it
answers with the complete new training, so callers patch their store in place
rather than refetch the week.

### Request

```json
{
	"height_difference": "light",
	"surface": "treadmill",
	"height_value": 0.0,
	"height_unit": "m"
}
```

`height_difference` and `surface` take the values in `TRAINING_HEIGHT_DIFFERENCES`
and `TRAINING_SURFACES`. The wrapper defaults `height_value` to `0` and
`height_unit` to `"m"` when the caller omits them.

### Notable fields

- **`height_value: 0.0` comes back as `training_condition.height_value: null`.**
  The zero is not stored as a zero — do not round-trip the response into the
  next request and expect the same body.
- `training_condition` matches `ScheduledTrainingCondition` field for field,
  `"type": "SchedulePivot"` included. This capture is what promoted that
  interface from inferred to observed.
- `training_condition.intensity` is `100` here even though no intensity step
  was touched — it is the resting value, not evidence of an applied change.
  The `selected` flag in `change_intensity_package.steps` remains the only
  reliable source, as that interface already warns.
- **Nine top-level fields below are absent from the week payload** (compare
  `WEEK_TRAINING_KEYS` in `payloads.test.ts`) and were untyped until this
  capture: `has_intelligence`, `intelligence_text`, `distance_limit`,
  `original_distance_km`, `base_distance`, `intelligence_distance`,
  `intelligence_distance_value`, `intelligence_distance_unit`,
  `intelligence_distance_unit_text`. The `intelligence_*` group is inert on
  this session (`has_intelligence: false` and every companion `null`), so only
  the disabled state has been seen — the shape of an _enabled_ one is still
  unknown, and the four `intelligence_distance*` fields are typed from the
  naming convention the rest of the API follows, not from observation.
- `original_distance_km: 12` equals the current distance, this training having
  no distance adjustment applied (`change_distance_package` step `0%`
  selected). Whether it tracks the pre-adjustment distance or something else
  cannot be told from a capture where the two are equal.
- `distance_limit: 0` — meaning unknown; `0` on the only session captured.

### Sample response

```json
{
	"id": 127477834,
	"day": 1787868000,
	"day_long": "2026-08-28",
	"title": "LSD",
	"description": "Tip: No need to take LSD 💊 for this LSD.",
	"show_description_from": 1787263200,
	"type": "training",
	"icon_url": "https://backend-prod.trenara.com/icons/icon__step.svg",
	"hex_training": "#44A6D3",
	"hex_completed": null,
	"last_garmin_sync": "2026-08-26 01:11:37",
	"can_be_edited": true,
	"can_cross_train": true,
	"cross_type": null,
	"can_toggle_cooldown": false,
	"has_cooldown": false,
	"can_change_distance": true,
	"change_distance_package": {
		"title": "Fine-tune distance",
		"text": "When you have limited time, time to spare, heavy legs, or... …",
		"steps": [
			{ "step": 1, "value": -10, "text": "-10%", "selected": false },
			{ "step": 2, "value": -5, "text": "-5%", "selected": false },
			{ "step": 3, "value": 0, "text": "0%", "selected": true },
			{ "step": 4, "value": 5, "text": "5%", "selected": false },
			{ "step": 5, "value": 10, "text": "10%", "selected": false }
		]
	},
	"can_change_intensity": true,
	"change_intensity_package": {
		"title": "Fine-tune intensity",
		"text": "Change today's session intensity within limits set by Coach Christophe. You can always ease off; increases are capped.",
		"steps": [
			{ "step": 1, "value": -4, "text": "Slower", "selected": false },
			{ "step": 2, "value": -2, "text": "A bit slower", "selected": false },
			{ "step": 3, "value": 0, "text": "As planned", "selected": true },
			{ "step": 4, "value": 2, "text": "A bit faster", "selected": false },
			{ "step": 5, "value": 4, "text": "Faster", "selected": false }
		]
	},
	"can_change_pacing_plan": false,
	"change_pacing_plan_package": null,
	"can_be_exchanged": true,
	"has_intelligence": false,
	"intelligence_text": null,
	"distance_limit": 0,
	"original_distance_km": 12,
	"base_distance": null,
	"intelligence_distance": null,
	"intelligence_distance_value": null,
	"intelligence_distance_unit": null,
	"intelligence_distance_unit_text": null,
	"team_data": {
		"team_id": 470,
		"name": "Valencia 42k",
		"picture": null,
		"nr_same_day_participants": 0,
		"nr_other_day_participants": 0,
		"matches_captain_day": true,
		"captain_pace": true,
		"can_toggle_pace": false,
		"can_show_participant_overview": true
	},
	"training": {
		"blocks": [
			{
				"order": 1,
				"repeat": 1,
				"type": "core",
				"blocks": [
					{
						"order": 1,
						"type": "run",
						"prior": "distance",
						"hex_graph": "#44A6D3",
						"hex_text": "#FFFFFF",
						"time": "01:07:11",
						"time_in_sec": 4031,
						"time_value": 4031,
						"time_unit": "sec",
						"distance": "12km",
						"distance_value": 12,
						"distance_unit": "km",
						"distance_unit_text": "km",
						"pace": "05:36 min/km",
						"pace_value": 336,
						"pace_unit": "min/km",
						"pace_per_hour": "10.71 km/h",
						"pace_per_hour_value": 336,
						"pace_per_hour_unit": "km/h",
						"prefer_pph": true,
						"pace_range": "05:23-05:49 min/km",
						"pace_range_value_min": 349,
						"pace_range_value_max": 323,
						"pace_per_hour_range": "10.32-11.15 km/h",
						"pace_per_hour_range_value_min": 349,
						"pace_per_hour_range_value_max": 323,
						"text": "Run 12km in 01:07:11 (05:23-05:49 min/km)",
						"text_pph": "Run 12km in 01:07:11 (10.32-11.15 km/h)"
					}
				]
			}
		],
		"total_time_in_sec": 4031,
		"total_distance_in_km": 12,
		"core_time_in_sec": 4031,
		"pre_advice": null,
		"post_advice": null,
		"core_distance": "12km",
		"core_distance_value": 12,
		"core_distance_unit": "km",
		"core_distance_unit_text": "km",
		"core_time": "01:07:11",
		"core_time_value": 4031,
		"core_time_unit": "sec",
		"total_distance": "12km",
		"total_distance_value": 12,
		"total_distance_unit": "km",
		"total_distance_unit_text": "km",
		"total_time": "01:07:11",
		"total_time_value": 4031,
		"total_time_unit": "sec"
	},
	"training_condition": {
		"id": 3829491,
		"type": "SchedulePivot",
		"height_difference": "light",
		"surface": "treadmill",
		"intensity": 100,
		"updated_at": 1787851880,
		"height": null,
		"height_value": null,
		"height_unit": null,
		"height_unit_text": null
	},
	"suggested_shoe": {
		"id": 6404,
		"brand": "Adidas",
		"name": "Boston 13",
		"type": "supertrainer",
		"preferred": false,
		"buy_date": "2026-01-11",
		"lifetime_percentage": 33.54750000000001,
		"created_at": "2026-01-14T09:05:28+01:00",
		"updated_at": "2026-01-14T09:05:28+01:00",
		"retired_at": null,
		"expected_lifetime_distance": "800km",
		"expected_lifetime_distance_value": 800,
		"expected_lifetime_distance_unit": "km",
		"expected_lifetime_distance_unit_text": "km",
		"distance_done": "268.38km",
		"distance_done_value": 268.38,
		"distance_done_unit": "km",
		"distance_done_unit_text": "km",
		"avg_pace": "05:09 min/km",
		"avg_pace_value": 309,
		"avg_pace_unit": "min/km",
		"picture": null
	}
}
```

---

## GET /api/threads/{id}/messages

One page of a chat thread. Read by `chatApi.getMessages`; rendered through the
helpers in `src/lib/components/chat/message-list.ts`, which exist because of
the first two points below.

### Notable fields

- **Newest first.** Page 1 is the ten most recent messages and `next` pages
  _backwards_ into history — the opposite of the order the bubble renders.
  `toOldestFirst` normalises on the way in.
- **`timestamp` (unix seconds) is required and acts as a stable anchor.** The
  `next` link carries the same value forward, so messages arriving mid-
  pagination do not shift the pages under you. `chatApi.getMessages` defaults
  it to now. Note the link also reorders the query string (`timestamp` before
  `page`) — cosmetic, but do not pattern-match the URL.
- `user_id: 3` is the coach bot, posting as "Walter" from a fixed asset on the
  backend host. Real users carry a CloudFront `picture_url`. Compare against
  the signed-in user rather than hard-coding 3, as `ChatMessage` warns.
- `url` was `null` on all eleven messages captured here, as in every payload
  before. Purpose still unknown.
- `picture_url` was present on every server message, though it stays optional
  on `ChatMessage`: `createPendingMessage` builds local placeholders without
  one.
- `body` is the source text and `body_html` the server-rendered HTML — the
  markdown is rendered upstream, not by us. Two trailing spaces in `body`
  become `<br />`; blank lines become `<p>`; the coach also emits `<h3>`,
  `<ul>` and `<strong>`. Render `body_html`, keep `body` for anything that
  needs plain text.
- `pagination.links` carried only `next` on page 1 — no `previous` — matching
  the optional-both shape on `Pagination`.

### Sample response

Bodies truncated; two of the ten messages shown.

```json
{
	"data": [
		{
			"id": 159769,
			"body": "Yes, an ergoespirometry test (with mask) can determine your thresholds…",
			"body_html": "<p>Yes, an ergoespirometry test (with mask) can determine your thresholds…</p>",
			"url": null,
			"user_id": 3,
			"picture_url": "https://backend-prod.trenara.com/img/walter.png",
			"created_at": 1787399675
		},
		{
			"id": 159768,
			"body": "Can the ergoespirometry test find the thresholds?",
			"body_html": "<p>Can the ergoespirometry test find the thresholds?</p>",
			"url": null,
			"user_id": 56540,
			"picture_url": "https://<cdn-host>/12356744/profile_picture.jpg",
			"created_at": 1787399669
		}
	],
	"pagination": {
		"total": 292,
		"count": 10,
		"per_page": 10,
		"current_page": 1,
		"total_pages": 30,
		"links": {
			"next": "https://backend-prod.trenara.com/api/threads/1482/messages?timestamp=1787859818&page=2"
		}
	}
}
```

---

## POST /api/threads/{id}/messages

Posts a message to a thread. Called by `chatApi.sendMessage`.

### Request

The field is **`body`**, matching what comes back — not `content`, which is
what this app's own internal route uses. An earlier version sent `content` and
was wrong.

```json
{ "body": "how much margin are in the goal plans to still reach the goal_" }
```

### Notable fields

- **The response is the posted message alone — the coach's reply is not in
  it.** A bare `ChatMessage`, not wrapped in `data` and not a list. The answer
  arrives only on a subsequent `GET .../messages`, which is why the UI shows a
  placeholder and polls rather than rendering a reply from this response.
- `body_html` is generated server-side even for a one-line message, so the
  saved copy is not a byte-for-byte echo of what was sent.
- `id` is a server-issued positive integer. Local placeholders use negative
  ids (`isPending`), and `replaceMessage` swaps one for the other in place.

### Sample response

```json
{
	"id": 161994,
	"body": "how much margin are in the goal plans to still reach the goal_",
	"body_html": "<p>how much margin are in the goal plans to still reach the goal_</p>",
	"url": null,
	"user_id": 56540,
	"picture_url": "https://<cdn-host>/12356744/profile_picture.jpg",
	"created_at": 1787852624
}
```
