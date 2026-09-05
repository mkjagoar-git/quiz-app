-- Quiz app schema (Neon/Postgres)
-- Single fixed organizer account lives in env vars, not in this schema.

CREATE TABLE quizzes (
  id            SERIAL PRIMARY KEY,
  slot_number   SMALLINT UNIQUE NOT NULL CHECK (slot_number BETWEEN 1 AND 3),
  quiz_name     TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER NOT NULL DEFAULT 10,
  num_questions INTEGER NOT NULL DEFAULT 0, -- how many of the uploaded questions to serve per attempt
  is_active     BOOLEAN NOT NULL DEFAULT false, -- becomes true once questions are uploaded
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the 3 fixed slots (QUIZ-1 / QUIZ-2 / QUIZ-3)
INSERT INTO quizzes (slot_number, quiz_name) VALUES
  (1, 'QUIZ-1'), (2, 'QUIZ-2'), (3, 'QUIZ-3')
ON CONFLICT (slot_number) DO NOTHING;

CREATE TABLE questions (
  id            SERIAL PRIMARY KEY,
  quiz_id       INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  order_index   INTEGER NOT NULL
);

CREATE TABLE options (
  id            SERIAL PRIMARY KEY,
  question_id   INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  option_text   TEXT NOT NULL,
  is_correct    BOOLEAN NOT NULL DEFAULT false,
  order_index   INTEGER NOT NULL
);

CREATE TABLE participants (
  id                   SERIAL PRIMARY KEY,
  username             TEXT UNIQUE NOT NULL,
  password_hash        TEXT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per participant, per quiz: whether a retake has been unlocked by the organizer.
-- Single-use grant: flips back to false automatically once the retake attempt is submitted.
CREATE TABLE participant_quiz_state (
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  quiz_id        INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  retake_allowed BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (participant_id, quiz_id)
);

CREATE TABLE attempts (
  id             SERIAL PRIMARY KEY,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  quiz_id        INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  score          INTEGER NOT NULL,
  total_marks    INTEGER NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at   TIMESTAMPTZ,
  UNIQUE (participant_id, quiz_id, attempt_number)
);

CREATE TABLE attempt_answers (
  id               SERIAL PRIMARY KEY,
  attempt_id       INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id      INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_option_ids INTEGER[] NOT NULL DEFAULT '{}',
  is_correct       BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_questions_quiz ON questions(quiz_id);
CREATE INDEX idx_options_question ON options(question_id);
CREATE INDEX idx_attempts_participant ON attempts(participant_id);
CREATE INDEX idx_attempts_quiz ON attempts(quiz_id);
