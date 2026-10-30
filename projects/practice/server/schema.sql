CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE users (
  id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  csrf TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE questions (
  id INTEGER PRIMARY KEY, owner_id INTEGER REFERENCES users(id),
  topic TEXT NOT NULL, difficulty TEXT NOT NULL CHECK(difficulty IN ('基础','进阶')),
  kind TEXT NOT NULL CHECK(kind IN ('single','multiple')), prompt TEXT NOT NULL,
  options_json TEXT NOT NULL, correct_json TEXT NOT NULL, explanation TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)), version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE attempts (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  question_id INTEGER NOT NULL REFERENCES questions(id), request_id TEXT NOT NULL,
  answers_json TEXT NOT NULL, correct INTEGER NOT NULL CHECK(correct IN (0,1)),
  question_version INTEGER NOT NULL, snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL, study_day TEXT NOT NULL,
  UNIQUE(user_id,request_id)
);
CREATE INDEX idx_attempts_user_time ON attempts(user_id,created_at);
CREATE TABLE reviews (
  user_id INTEGER NOT NULL REFERENCES users(id), question_id INTEGER NOT NULL REFERENCES questions(id),
  note TEXT NOT NULL DEFAULT '', mastered INTEGER NOT NULL DEFAULT 0 CHECK(mastered IN (0,1)),
  updated_at TEXT NOT NULL, PRIMARY KEY(user_id,question_id)
);
CREATE VIEW view_user_topic_stats AS
SELECT user_id,json_extract(snapshot_json,'$.topic') AS topic,
COUNT(*) AS attempts,SUM(correct) AS correct,COUNT(DISTINCT question_id) AS covered
FROM attempts GROUP BY user_id,json_extract(snapshot_json,'$.topic');
