package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/rmrobinson/meridian/backend/internal/domain"
)

// ErrNotFound is returned when a requested row does not exist or is not accessible.
var ErrNotFound = errors.New("not found")

// ListEventsFilter constrains the results returned by ListEvents.
type ListEventsFilter struct {
	FamilyID    string
	From        string // ISO 8601 date, inclusive
	To          string // ISO 8601 date, inclusive
	Visibilities []domain.Visibility
}

// CreateEvent inserts a new event row.
func (d *DB) CreateEvent(ctx context.Context, e *domain.Event) error {
	_, err := d.db.ExecContext(ctx, `
		INSERT INTO events (
			id, family_id, line_key, parent_line_key, type, activity_type, title, label, icon,
			date, start_date, end_date, location_label, location_lat, location_lng,
			external_url, hero_image_url, metadata, visibility,
			source_service, source_event_id, canonical_id, created_at, updated_at
		) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		e.ID, e.FamilyID, e.LineKey, e.ParentLineKey, string(e.Type), activityTypePtr(e.ActivityType), e.Title,
		e.Label, e.Icon, e.Date, e.StartDate, e.EndDate,
		e.LocationLabel, e.LocationLat, e.LocationLng,
		e.ExternalURL, e.HeroImageURL, e.Metadata, string(e.Visibility),
		e.SourceService, e.SourceEventID, e.CanonicalID,
		e.CreatedAt.UTC().Format(time.RFC3339Nano),
		e.UpdatedAt.UTC().Format(time.RFC3339Nano),
	)
	if err != nil {
		return fmt.Errorf("inserting event: %w", err)
	}
	return nil
}

// GetEventByID returns the event with the given ID, excluding soft-deleted rows.
func (d *DB) GetEventByID(ctx context.Context, id string) (*domain.Event, error) {
	row := d.db.QueryRowContext(ctx, `
		SELECT id, family_id, line_key, parent_line_key, type, activity_type, title, label, icon,
		       date, start_date, end_date, location_label, location_lat, location_lng,
		       external_url, hero_image_url, metadata, visibility,
		       source_service, source_event_id, canonical_id, created_at, updated_at, deleted_at
		FROM events
		WHERE id = ? AND deleted_at IS NULL`, id)

	e, err := scanEvent(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return e, err
}

// ListEvents returns canonical, non-deleted events matching the filter.
func (d *DB) ListEvents(ctx context.Context, f ListEventsFilter) ([]*domain.Event, error) {
	query := `
		SELECT id, family_id, line_key, parent_line_key, type, activity_type, title, label, icon,
		       date, start_date, end_date, location_label, location_lat, location_lng,
		       external_url, hero_image_url, metadata, visibility,
		       source_service, source_event_id, canonical_id, created_at, updated_at, deleted_at
		FROM events
		WHERE deleted_at IS NULL
		  AND canonical_id IS NULL`

	args := []any{}

	if f.FamilyID != "" {
		query += " AND family_id = ?"
		args = append(args, f.FamilyID)
	}
	if f.From != "" {
		query += " AND COALESCE(start_date, date) >= ?"
		args = append(args, f.From)
	}
	if f.To != "" {
		query += " AND COALESCE(start_date, date) <= ?"
		args = append(args, f.To)
	}
	if len(f.Visibilities) > 0 {
		placeholders := "?"
		args = append(args, string(f.Visibilities[0]))
		for _, v := range f.Visibilities[1:] {
			placeholders += ",?"
			args = append(args, string(v))
		}
		query += " AND visibility IN (" + placeholders + ")"
	}

	rows, err := d.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("listing events: %w", err)
	}
	defer rows.Close()

	var events []*domain.Event
	for rows.Next() {
		e, err := scanEvent(rows)
		if err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, rows.Err()
}

// UpdateEvent fully replaces all fields of an existing event.
func (d *DB) UpdateEvent(ctx context.Context, e *domain.Event) error {
	res, err := d.db.ExecContext(ctx, `
		UPDATE events SET
			family_id = ?, line_key = ?, parent_line_key = ?, type = ?, activity_type = ?, title = ?,
			label = ?, icon = ?, date = ?, start_date = ?, end_date = ?,
			location_label = ?, location_lat = ?, location_lng = ?,
			external_url = ?, hero_image_url = ?, metadata = ?, visibility = ?,
			source_service = ?, source_event_id = ?, canonical_id = ?,
			updated_at = ?
		WHERE id = ? AND deleted_at IS NULL`,
		e.FamilyID, e.LineKey, e.ParentLineKey, string(e.Type), activityTypePtr(e.ActivityType), e.Title,
		e.Label, e.Icon, e.Date, e.StartDate, e.EndDate,
		e.LocationLabel, e.LocationLat, e.LocationLng,
		e.ExternalURL, e.HeroImageURL, e.Metadata, string(e.Visibility),
		e.SourceService, e.SourceEventID, e.CanonicalID,
		time.Now().UTC().Format(time.RFC3339Nano),
		e.ID,
	)
	if err != nil {
		return fmt.Errorf("updating event: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// SoftDeleteEvent sets deleted_at on the event, hiding it from future queries.
func (d *DB) SoftDeleteEvent(ctx context.Context, id string) error {
	res, err := d.db.ExecContext(ctx,
		`UPDATE events SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`,
		time.Now().UTC().Format(time.RFC3339Nano), id,
	)
	if err != nil {
		return fmt.Errorf("soft-deleting event: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// GetEventBySourceID returns the canonical event with the given source service and
// source event ID, excluding soft-deleted rows.
func (d *DB) GetEventBySourceID(ctx context.Context, sourceService, sourceEventID string) (*domain.Event, error) {
	row := d.db.QueryRowContext(ctx, `
		SELECT id, family_id, line_key, parent_line_key, type, activity_type, title, label, icon,
		       date, start_date, end_date, location_label, location_lat, location_lng,
		       external_url, hero_image_url, metadata, visibility,
		       source_service, source_event_id, canonical_id, created_at, updated_at, deleted_at
		FROM events
		WHERE source_service = ? AND source_event_id = ? AND deleted_at IS NULL
		LIMIT 1`, sourceService, sourceEventID)
	e, err := scanEvent(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return e, err
}

// SetCanonicalID links an event to a canonical event by setting its canonical_id.
func (d *DB) SetCanonicalID(ctx context.Context, id, canonicalID string) error {
	res, err := d.db.ExecContext(ctx,
		`UPDATE events SET canonical_id = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
		canonicalID, time.Now().UTC().Format(time.RFC3339Nano), id,
	)
	if err != nil {
		return fmt.Errorf("setting canonical_id: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// ClearCanonicalID detaches a linked event back to standalone canonical.
func (d *DB) ClearCanonicalID(ctx context.Context, id string) error {
	res, err := d.db.ExecContext(ctx,
		`UPDATE events SET canonical_id = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
		time.Now().UTC().Format(time.RFC3339Nano), id,
	)
	if err != nil {
		return fmt.Errorf("clearing canonical_id: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// GetEventWithLinked returns the canonical event and all non-canonical rows linked to it.
func (d *DB) GetEventWithLinked(ctx context.Context, id string) (*domain.Event, []*domain.Event, error) {
	canonical, err := d.GetEventByID(ctx, id)
	if err != nil {
		return nil, nil, err
	}

	rows, err := d.db.QueryContext(ctx, `
		SELECT id, family_id, line_key, parent_line_key, type, activity_type, title, label, icon,
		       date, start_date, end_date, location_label, location_lat, location_lng,
		       external_url, hero_image_url, metadata, visibility,
		       source_service, source_event_id, canonical_id, created_at, updated_at, deleted_at
		FROM events
		WHERE canonical_id = ? AND deleted_at IS NULL`, id)
	if err != nil {
		return nil, nil, fmt.Errorf("listing linked events: %w", err)
	}
	defer rows.Close()

	var linked []*domain.Event
	for rows.Next() {
		e, err := scanEvent(rows)
		if err != nil {
			return nil, nil, err
		}
		linked = append(linked, e)
	}
	return canonical, linked, rows.Err()
}

// activityTypePtr returns nil for the zero ActivityType so that unset activity
// types are stored as NULL rather than an empty string.
func activityTypePtr(a domain.ActivityType) *string {
	if a == domain.ActivityTypeUnspecified {
		return nil
	}
	s := string(a)
	return &s
}

// scanner is satisfied by both *sql.Row and *sql.Rows.
type scanner interface {
	Scan(dest ...any) error
}

func scanEvent(s scanner) (*domain.Event, error) {
	var e domain.Event
	var (
		parentLineKey sql.NullString
		activityType  sql.NullString
		label         sql.NullString
		icon          sql.NullString
		date          sql.NullString
		startDate     sql.NullString
		endDate       sql.NullString
		locationLabel sql.NullString
		locationLat   sql.NullFloat64
		locationLng   sql.NullFloat64
		externalURL   sql.NullString
		heroImageURL  sql.NullString
		metadata      sql.NullString
		sourceService sql.NullString
		sourceEventID sql.NullString
		canonicalID   sql.NullString
		createdAt     string
		updatedAt     string
		deletedAt     sql.NullString
		eventType     string
		visibility    string
	)

	err := s.Scan(
		&e.ID, &e.FamilyID, &e.LineKey, &parentLineKey, &eventType, &activityType, &e.Title,
		&label, &icon, &date, &startDate, &endDate,
		&locationLabel, &locationLat, &locationLng,
		&externalURL, &heroImageURL, &metadata, &visibility,
		&sourceService, &sourceEventID, &canonicalID,
		&createdAt, &updatedAt, &deletedAt,
	)
	if err != nil {
		return nil, err
	}

	e.Type = domain.EventType(eventType)
	e.Visibility = domain.Visibility(visibility)
	if activityType.Valid {
		e.ActivityType = domain.ActivityType(activityType.String)
	}

	if parentLineKey.Valid {
		e.ParentLineKey = &parentLineKey.String
	}
	if label.Valid {
		e.Label = &label.String
	}
	if icon.Valid {
		e.Icon = &icon.String
	}
	if date.Valid {
		e.Date = &date.String
	}
	if startDate.Valid {
		e.StartDate = &startDate.String
	}
	if endDate.Valid {
		e.EndDate = &endDate.String
	}
	if locationLabel.Valid {
		e.LocationLabel = &locationLabel.String
	}
	if locationLat.Valid {
		e.LocationLat = &locationLat.Float64
	}
	if locationLng.Valid {
		e.LocationLng = &locationLng.Float64
	}
	if externalURL.Valid {
		e.ExternalURL = &externalURL.String
	}
	if heroImageURL.Valid {
		e.HeroImageURL = &heroImageURL.String
	}
	if metadata.Valid {
		e.Metadata = &metadata.String
	}
	if sourceService.Valid {
		e.SourceService = &sourceService.String
	}
	if sourceEventID.Valid {
		e.SourceEventID = &sourceEventID.String
	}
	if canonicalID.Valid {
		e.CanonicalID = &canonicalID.String
	}

	if t, err := time.Parse(time.RFC3339Nano, createdAt); err == nil {
		e.CreatedAt = t
	}
	if t, err := time.Parse(time.RFC3339Nano, updatedAt); err == nil {
		e.UpdatedAt = t
	}
	if deletedAt.Valid {
		if t, err := time.Parse(time.RFC3339Nano, deletedAt.String); err == nil {
			e.DeletedAt = &t
		}
	}

	return &e, nil
}
