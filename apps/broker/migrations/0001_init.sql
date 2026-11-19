-- Kinship Edge Broker state. By design this holds no contact PII:
-- DIDs, opaque space refs and hashed invite tokens only (PRD § 4).

CREATE TABLE invites (
  token_hash        TEXT PRIMARY KEY,          -- hex SHA-256 of the bearer token
  issuer_did        TEXT NOT NULL,
  bundle_id         TEXT NOT NULL,
  space_refs        TEXT NOT NULL,             -- JSON array of opaque space refs
  max_uses          INTEGER NOT NULL,
  uses              INTEGER NOT NULL DEFAULT 0,
  expires_at        INTEGER NOT NULL,          -- ms epoch
  approval_mode     TEXT NOT NULL CHECK (approval_mode IN ('auto', 'manual')),
  allow_vcf_fallback INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX invites_issuer ON invites (issuer_did);

-- Who may read which of an issuer's spaces: a mirror of the PDS member lists
-- (decision 0003), used for redemption and as the sync service's index.
CREATE TABLE allowlist (
  issuer_did   TEXT NOT NULL,
  space_ref    TEXT NOT NULL,
  allowed_did  TEXT NOT NULL,
  granted_at   INTEGER NOT NULL,
  PRIMARY KEY (issuer_did, space_ref, allowed_did)
);

CREATE TABLE pending_requests (
  id            TEXT PRIMARY KEY,
  issuer_did    TEXT NOT NULL,
  requester_did TEXT NOT NULL,
  bundle_id     TEXT NOT NULL,
  space_refs    TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied'))
);
CREATE INDEX pending_by_issuer ON pending_requests (issuer_did, status);
