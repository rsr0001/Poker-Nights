CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  google_sub text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS login_challenges (
  nonce_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  cash integer NOT NULL CHECK (cash BETWEEN 1 AND 10000000),
  chips integer NOT NULL CHECK (chips BETWEEN 1 AND 1000000000),
  players jsonb NOT NULL CHECK (jsonb_typeof(players) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS groups_owner ON groups(user_id);
CREATE TABLE IF NOT EXISTS game_history (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id uuid NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  completed_at timestamptz NOT NULL,
  total bigint NOT NULL CHECK (total > 0),
  player_count integer NOT NULL CHECK (player_count BETWEEN 1 AND 50),
  snapshot jsonb NOT NULL,
  result jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,game_id)
);
CREATE INDEX IF NOT EXISTS history_owner_date ON game_history(user_id,completed_at DESC,game_id DESC);
