-- Service-auth token ids already spent (iss + jti), kept until the token
-- expires, so a captured token can't be replayed.
CREATE TABLE seen_tokens (
  id         TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL  -- seconds epoch, from the token's exp
);
CREATE INDEX seen_tokens_expiry ON seen_tokens (expires_at);
