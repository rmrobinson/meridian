CREATE TABLE events (
    id              TEXT PRIMARY KEY,
    family_id       TEXT NOT NULL,
    line_key        TEXT NOT NULL,
    parent_line_key TEXT,
    type            TEXT NOT NULL CHECK(type IN ('span', 'point')),
    title           TEXT NOT NULL,
    label           TEXT,
    icon            TEXT,
    date            TEXT,
    start_date      TEXT,
    end_date        TEXT,
    location_label  TEXT,
    location_lat    REAL,
    location_lng    REAL,
    external_url    TEXT,
    hero_image_url  TEXT,
    metadata        TEXT,
    visibility      TEXT NOT NULL DEFAULT 'personal'
                        CHECK(visibility IN ('public', 'friends', 'family', 'personal')),
    source_service  TEXT,
    source_event_id TEXT,
    canonical_id    TEXT REFERENCES events(id),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at      TEXT
);

CREATE TABLE photos (
    id         TEXT PRIMARY KEY,
    event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    s3_url     TEXT NOT NULL,
    variant    TEXT NOT NULL CHECK(variant IN ('hero', 'thumb', 'original')),
    sort_order INTEGER NOT NULL DEFAULT 0
);
