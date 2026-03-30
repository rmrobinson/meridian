CREATE INDEX IF NOT EXISTS idx_events_family_date
    ON events (family_id, date, deleted_at);

CREATE INDEX IF NOT EXISTS idx_events_source
    ON events (source_service, source_event_id)
    WHERE source_service IS NOT NULL AND source_event_id IS NOT NULL;
