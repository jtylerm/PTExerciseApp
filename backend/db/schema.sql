-- backend/db/schema.sql

CREATE TABLE IF NOT EXISTS Exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_name TEXT NOT NULL,
    exercise_type TEXT NOT NULL,
    muscle TEXT NOT NULL,
    equipment TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    instructions TEXT NOT NULL,
    is_favorited INTEGER DEFAULT 0,
    last_updated DATETIME DEFAULT NULL,
    created_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_exercises_name ON Exercises(exercise_name);
CREATE INDEX IF NOT EXISTS idx_exercises_muscle ON Exercises(muscle);
CREATE INDEX IF NOT EXISTS idx_exercises_type ON Exercises(exercise_type);
CREATE INDEX IF NOT EXISTS idx_exercises_favorited ON Exercises(is_favorited);