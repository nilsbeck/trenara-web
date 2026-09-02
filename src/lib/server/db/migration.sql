-- Prediction History table
-- Run this in the Supabase SQL Editor to set up the database.

CREATE TABLE IF NOT EXISTS prediction_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    predicted_time VARCHAR(20) NOT NULL,
    predicted_pace VARCHAR(20) NOT NULL,
    recorded_at DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_prediction_history_user_date
    ON prediction_history(user_id, recorded_at);

CREATE INDEX IF NOT EXISTS idx_prediction_history_user_latest
    ON prediction_history(user_id, recorded_at DESC, created_at DESC);

-- Goal History table
-- Stores archived goals so users can review their training history.

CREATE TABLE IF NOT EXISTS goal_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    goal_name VARCHAR(255) NOT NULL,
    distance VARCHAR(50) NOT NULL,
    goal_time VARCHAR(20) NOT NULL,
    goal_pace VARCHAR(20) NOT NULL,
    final_predicted_time VARCHAR(20),
    final_predicted_pace VARCHAR(20),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    archived_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, goal_name, end_date)
);

CREATE INDEX IF NOT EXISTS idx_goal_history_user_end_date
    ON goal_history(user_id, end_date DESC);

-- 10K reference prediction (added later)
-- The goal-distance prediction (predicted_time / predicted_pace) changes meaning
-- whenever the user's goal distance changes, which makes the all-time series
-- incomparable. These columns carry the 10K prediction for the same day so the
-- long-term history can be plotted against a fixed distance.
-- Rows recorded before this migration keep NULL here and are skipped by the
-- all-time chart.

ALTER TABLE prediction_history
    ADD COLUMN IF NOT EXISTS predicted_time_10k VARCHAR(20),
    ADD COLUMN IF NOT EXISTS predicted_pace_10k VARCHAR(20);

-- News read state (added later)
-- Trenara's news endpoint carries no read/unread state, so the newest item a
-- reader has been shown is recorded here. One row per user: news is
-- append-only and newest-first, so a single high-water mark answers "is there
-- anything new?" without a row per item. Seeded on a reader's first visit to
-- the newest item that exists then, which is what keeps an existing user's
-- backlog from raising a badge they never asked for.

CREATE TABLE IF NOT EXISTS news_read_state (
    user_id INTEGER PRIMARY KEY,
    last_seen_id INTEGER NOT NULL,
    -- Unix seconds, matching NewsItem.created_at. The feed is ordered by this,
    -- so it — not the id — decides what counts as newer.
    last_seen_created_at BIGINT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat read state (added later)
-- Trenara's `unread_messages` per thread does not clear when the messages are
-- read through this app, so on its own it re-badges conversations the reader
-- finished days ago. The newest message this app has actually shown them is
-- recorded here instead, one row per user and thread, and a thread only counts
-- as unread when Trenara reports unread messages *and* its newest message is
-- past that mark. Seeded on first sight of a thread, which is what keeps a
-- sticky count for an old conversation from raising a badge.

CREATE TABLE IF NOT EXISTS chat_read_state (
    user_id INTEGER NOT NULL,
    thread_id INTEGER NOT NULL,
    -- Trenara message id. 0 means "seen an empty thread".
    last_seen_message_id BIGINT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, thread_id)
);

-- Derived 10K equivalents (added later)
-- The 10K columns above only started recording recently, which left the
-- comparable series four points long against a hundred and sixty rows of
-- goal-distance predictions. A stored time and pace imply the distance they
-- were about, and every prediction the API returns sits on one curve, so an
-- older row converts to the 10K the API would have given that day.
-- Written to columns of their own rather than into the recorded ones: once a
-- derived value is mixed in with a measured one there is no telling them apart
-- again. A row with a recorded 10K never gets a derived one.

ALTER TABLE prediction_history
    ADD COLUMN IF NOT EXISTS derived_time_10k VARCHAR(20),
    ADD COLUMN IF NOT EXISTS derived_pace_10k VARCHAR(20);

-- The recorded prediction set (added later)
-- Every stats response carries predictions for five distances and only two of
-- them were kept, so anything else had to be reconstructed by inference later.
-- These hold the rest as the API gave them, which is what keeps a recorded
-- value distinguishable from a derived one.
-- Times only: a pace is the time over a known distance, and storing both
-- invites them to disagree. NULL on rows written by a client that sends only
-- the goal and 10K predictions.

ALTER TABLE prediction_history
    ADD COLUMN IF NOT EXISTS predicted_time_5k VARCHAR(20),
    ADD COLUMN IF NOT EXISTS predicted_time_half VARCHAR(20),
    ADD COLUMN IF NOT EXISTS predicted_time_marathon VARCHAR(20);

-- The Riegel curve behind each day's row (added later)
-- Every stats response is one fitness estimate rendered at several distances:
-- the figures in it lie on `T = a * D^e`. The columns above store the rendering
-- and threw the curve away, so the two halves of it had to be re-derived on
-- every read, and the halves say different things.
--   riegel_level    `a`, seconds over one kilometre. Where the curve sits: the
--                   runner's fitness that day, moving week to week.
--   riegel_exponent `e`. How steeply it rises: the shape of the runner's
--                   endurance, moving over months, and the number that cannot
--                   be shared between two runners.
--   riegel_source   'fitted' where the row's own predictions fixed the
--                   exponent, 'borrowed' where the row states one distance and
--                   the exponent had to come from a neighbouring day. The level
--                   is a measurement either way; how much to trust it depends
--                   on this, which is why it is recorded rather than inferred.
-- Storing the pair is also what makes derived_time_10k reproducible: it is
-- exactly `a * 10^e` for the row it sits on, rather than whatever a median over
-- recent rows happened to be on the day the back-fill ran.

ALTER TABLE prediction_history
    ADD COLUMN IF NOT EXISTS riegel_exponent NUMERIC(6, 4),
    ADD COLUMN IF NOT EXISTS riegel_level NUMERIC(9, 3),
    ADD COLUMN IF NOT EXISTS riegel_source VARCHAR(10)
        CHECK (riegel_source IS NULL OR riegel_source IN ('fitted', 'borrowed'));

-- The back-fill asks for this user's rows that have no curve yet, and for the
-- fitted ones it borrows exponents from; both are answered here rather than by
-- reading every row the user has.
CREATE INDEX IF NOT EXISTS idx_prediction_history_user_curve
    ON prediction_history(user_id, riegel_source, recorded_at);

-- ─────────────────────────────────────────────────────────────
-- Row Level Security (added later)
--
-- Every table above was created without it, and the app connects with the
-- service role key — which bypasses RLS outright. So the only thing standing
-- between one runner's history and another's was that every DAO remembered to
-- write `.eq('user_id', …)`. They all do. Nothing enforced it, and one query
-- added without that clause would have exposed every user.
--
-- What this changes, and what it does not:
--
-- RLS is enabled with no policies at all, which denies everything. The service
-- role still passes — it is exempt by design, and it is what the server uses —
-- so the app is unaffected. What stops working is every other way in: the
-- anon key, an authenticated JWT, anything reaching the project's public REST
-- endpoint. Those returned whole tables before, and the day the anon key or
-- the project URL leaks is the day that mattered.
--
-- It is a floor, not the whole answer: the DAO filter is still what scopes a
-- query the server makes, and RLS cannot check it. It means a leak now needs
-- the service role key rather than any credential at all.
--
-- No policies are written deliberately. A policy would have to say what an
-- end user may read, and no end user ever connects — this app's readers
-- authenticate with Trenara, not with Supabase, and `user_id` here is a
-- Trenara id with no Supabase identity behind it. A policy keyed on
-- `auth.uid()` would be fiction. If direct client access is ever wanted, that
-- is the point at which to design one.

ALTER TABLE prediction_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_read_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_read_state ENABLE ROW LEVEL SECURITY;

-- Belt and braces: revoke the grants PostgREST exposes those roles through, so
-- the tables are unreachable for them even if RLS is ever switched off again.
REVOKE ALL ON prediction_history, goal_history, news_read_state, chat_read_state
    FROM anon, authenticated;

-- A cap on the goal archive.
--
-- `goal_history` is unique on (user_id, goal_name, end_date) and `goal_name`
-- used to be a free string from the request body, so an account could write as
-- many rows as it cared to invent names for. The endpoint derives the goal
-- from Trenara now, which is the real fix; this is the backstop, sized far
-- above any plausible number of goals a runner will ever train for.
CREATE OR REPLACE FUNCTION goal_history_row_cap() RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM goal_history WHERE user_id = NEW.user_id) >= 500 THEN
        RAISE EXCEPTION 'goal history limit reached for user %', NEW.user_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS goal_history_row_cap_trigger ON goal_history;
CREATE TRIGGER goal_history_row_cap_trigger
    BEFORE INSERT ON goal_history
    FOR EACH ROW EXECUTE FUNCTION goal_history_row_cap();

-- The same for chat read marks, which are keyed on a thread id the client
-- names. The endpoint checks the thread is the reader's own now; this bounds
-- the damage if that check is ever bypassed or removed.
CREATE OR REPLACE FUNCTION chat_read_state_row_cap() RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM chat_read_state WHERE user_id = NEW.user_id) >= 1000 THEN
        RAISE EXCEPTION 'chat read state limit reached for user %', NEW.user_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chat_read_state_row_cap_trigger ON chat_read_state;
CREATE TRIGGER chat_read_state_row_cap_trigger
    BEFORE INSERT ON chat_read_state
    FOR EACH ROW EXECUTE FUNCTION chat_read_state_row_cap();

-- Shared goal links (added later)
-- Lets a runner hand a friend a link to their current goal: the friend sees a
-- read-only goal card with no account of their own. The card cannot be
-- rendered live for a visitor — Trenara only answers a request carrying the
-- runner's own access token, and that token must never reach a public route —
-- so this table holds a projection of the card's inputs instead, refreshed on
-- the runner's own page loads. See .kiro/specs/goal-sharing/design.md.

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
    -- key (see the RLS block below). A hash would be right if this were a
    -- credential; it is a capability for a page of running numbers.
    token VARCHAR(64) NOT NULL,
    -- The runner's own words for the link, optional. Bounded so the column is
    -- not a place to store a document.
    title VARCHAR(80),
    -- First name as it was when the link was made. Copied rather than joined:
    -- the public read must not touch anything else, and there is nothing else
    -- to join to — `/api/me` needs the owner's token.
    display_name VARCHAR(80),
    -- The goal card's inputs, projected. See `SharedSnapshot` in
    -- `$lib/server/share/snapshot.ts` for what may appear here; the
    -- projection is the privacy boundary, so it is a named type and not
    -- `Goal`/`UserStats` passed through.
    snapshot JSONB,
    snapshot_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- One link per goal. `PUT /api/v1/goal-share` rotates the token on this
    -- row rather than creating a second one.
    UNIQUE (user_id, goal_id)
);

-- The public read is `WHERE token = $1`, and it is the only query a stranger
-- can cause. Unique so it is an index probe and so a token cannot be issued
-- twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_goal_share_token ON goal_share(token);

-- No index is declared for the owner's own lookups. `UNIQUE (user_id, goal_id)`
-- above already creates one, and it serves both of them: the goal page's "is
-- this goal shared?" is an equality probe on the whole key, and the row-cap
-- trigger's `COUNT(… WHERE user_id = …)` is a scan of its leading column. A
-- second index on the same pair would be paid for on every write and read
-- from never.

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
