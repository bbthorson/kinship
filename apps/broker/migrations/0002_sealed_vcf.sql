-- One-time sealed vCards (docs/open-questions.md § 5). Ciphertext only: the
-- key lives in the invite URL's fragment and never reaches the broker.
-- Rows are deleted on first read.
CREATE TABLE sealed_vcfs (
  token_hash TEXT PRIMARY KEY REFERENCES invites (token_hash) ON DELETE CASCADE,
  iv         TEXT NOT NULL,
  ciphertext TEXT NOT NULL
);
