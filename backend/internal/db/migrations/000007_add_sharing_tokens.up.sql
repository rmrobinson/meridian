CREATE TABLE sharing_tokens (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    visibility TEXT NOT NULL CHECK(visibility IN ('public', 'friends', 'family', 'personal')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT,
    deleted_at TEXT
);

CREATE INDEX idx_sharing_tokens_email ON sharing_tokens(email);
