# Exporting the plan

`scripts/extract-plan.ts` writes the training plan for a date range to a single
newline-delimited JSON file, so it can be diffed, charted or compared against
another plan.

It talks to Trenara directly — no dev server, no Supabase, no browser session —
because the plan is a read and `/api/schedule/week/` will answer a Bearer token
on its own. The shapes and the normalisation live in `src/lib/plan-export/`
under the same tests as the rest of the codebase, so an upstream change breaks
the export in the same place it breaks the app.

## Running it

```sh
bun run extract:plan -- --to 2026-12-06
bun run extract:plan -- --from 2026-09-01 --to 2026-12-06 --format csv
```

| Flag                  | Meaning                                     |
| --------------------- | ------------------------------------------- |
| `--to <YYYY-MM-DD>`   | Last day to export. **Required.**           |
| `--from <YYYY-MM-DD>` | First day. Default: today.                  |
| `--out <dir>`         | Output directory. Default: `./plan-export`. |
| `--format <fmt>`      | `jsonl` (default), `json`, or `csv`.        |
| `--no-raw`            | Omit the untouched upstream payloads.       |

`/plan-export` is git-ignored: an export is a runner's own training data and
does not belong in the repository.

### Credentials

Read from the environment, or from a `.env` in the working directory. Real
environment variables win over the file, so a one-off run can override it.

Either an existing Bearer:

```sh
TRENARA_ACCESS_TOKEN=...
```

or the three values needed to sign in, the same client credential the app uses:

```sh
TRENARA_EMAIL=...
TRENARA_PASSWORD=...
BASIC_BEARER_TOKEN=...
```

The token is worth an account, so prefer a `.env` (already git-ignored) over a
shell command that lands in your history.

## What comes out

One `plan.jsonl`: a record per line, discriminated by `record`.

| `record`   | One line per                                              |
| ---------- | --------------------------------------------------------- |
| `meta`     | the export itself — range, timezone, source, and the goal |
| `week`     | week, with planned and completed volume                   |
| `session`  | planned session, **blocks nested on the same line**       |
| `strength` | strength session                                          |
| `entry`    | logged activity                                           |
| `raw_week` | fetched week, upstream payload untouched                  |

Records are written in that order, and the order is stable, so two exports line
up under `diff`. `raw_week` comes last because it is the bulk of the file and
the least often read.

A session keeps its blocks, so nothing has to be joined back:

```sh
# Planned distance per session
jq -r 'select(.record == "session") | "\(.date)\t\(.total_distance_km)"' plan.jsonl

# Every running block in the plan
jq -c 'select(.record == "session") | .blocks[] | select(.type == "run")' plan.jsonl
```

```python
import pandas as pd
rows = pd.read_json('plan.jsonl', lines=True)
sessions = rows[rows.record == 'session']
```

### The other two formats

`--format json` writes the same data as one `plan.json` tree — the same keys,
nested under `meta` / `goal` / `weeks` / `sessions` / `strength` / `entries` /
`raw` instead of tagged per line.

`--format csv` writes four files, one grain each, for a spreadsheet. A session
and a block cannot share a row without one of them being repeated into
nonsense, which is why they cannot be one table: `sessions.csv`, `blocks.csv`,
`entries.csv`, `weeks.csv`. Every numeric column keeps its normalised form and
gains a human twin — `4068` beside `1:07:48`, `319` beside `5:19`.

### What normalisation means here

The week payload is shaped for a screen, and three of its habits do not survive
a comparison:

- **Distance changes unit per row** — `800` with `distance_unit: 'm'` on an
  interval, `4` with `'km'` on the long run. Every distance in the export is
  kilometres.
- **Pace is seconds per whatever `pace_unit` names** (`'min/km'` in every
  capture so far), which is a denominator to read rather than a unit to look
  up. Every pace in the export is seconds per km.
- **The applied intensity is not a field.** `training_condition` is `null` on
  any session whose terrain has never been set, even when an intensity step
  _is_ applied, so the export reads the `selected` step out of
  `change_intensity_package` and writes it as `intensity_pct` (`98` for "A bit
  slower"). The step's own text rides along, because a distance step is a
  percentage on a steady run and a repetition count on an interval session.

Blocks are flattened, and a repeat group is kept as a row of its own rather
than dropped: 3×800m and 5×800m differ only at the group. Each block gets a
dotted `path` (`2.1` is the first child of the second block), which is what
makes it addressable in a diff — the upstream `order` is 1-based within its
parent and repeats across a session.

Weeks are fetched by Monday, so the first and last of them overhang the range
asked for. Rows are filtered by their own date, so `--from` and `--to` mean
exactly what they say.

### Fidelity

The export carries the untouched week payloads unless `--no-raw` is passed — as
`raw_week` lines in JSONL, under `raw` in JSON. Anything the normalisation chose
not to model is still in the file. CSV cannot hold them, so `--format csv` drops
them whatever `--no-raw` says.
