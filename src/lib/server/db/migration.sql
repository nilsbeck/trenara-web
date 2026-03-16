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
