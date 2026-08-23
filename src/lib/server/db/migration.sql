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
