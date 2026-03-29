package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/rmrobinson/meridian/backend/internal/domain"
)

// AddPhoto inserts a new photo record.
func (d *DB) AddPhoto(ctx context.Context, p *domain.Photo) error {
	_, err := d.db.ExecContext(ctx,
		`INSERT INTO photos (id, event_id, s3_url, variant, sort_order) VALUES (?,?,?,?,?)`,
		p.ID, p.EventID, p.S3URL, string(p.Variant), p.SortOrder,
	)
	if err != nil {
		return fmt.Errorf("inserting photo: %w", err)
	}
	return nil
}

// RemovePhoto deletes the photo with the given ID.
func (d *DB) RemovePhoto(ctx context.Context, id string) error {
	res, err := d.db.ExecContext(ctx, `DELETE FROM photos WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("deleting photo: %w", err)
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

// ListPhotosForEvent returns all photos for an event ordered by sort_order ascending.
func (d *DB) ListPhotosForEvent(ctx context.Context, eventID string) ([]*domain.Photo, error) {
	rows, err := d.db.QueryContext(ctx,
		`SELECT id, event_id, s3_url, variant, sort_order FROM photos WHERE event_id = ? ORDER BY sort_order ASC`,
		eventID,
	)
	if err != nil {
		return nil, fmt.Errorf("listing photos: %w", err)
	}
	defer rows.Close()

	var photos []*domain.Photo
	for rows.Next() {
		p, err := scanPhoto(rows)
		if err != nil {
			return nil, err
		}
		photos = append(photos, p)
	}
	return photos, rows.Err()
}

// ReorderPhotos updates sort_order for each photo ID in the order given.
func (d *DB) ReorderPhotos(ctx context.Context, eventID string, orderedIDs []string) error {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("beginning transaction: %w", err)
	}
	defer tx.Rollback()

	for i, id := range orderedIDs {
		res, err := tx.ExecContext(ctx,
			`UPDATE photos SET sort_order = ? WHERE id = ? AND event_id = ?`,
			i, id, eventID,
		)
		if err != nil {
			return fmt.Errorf("updating sort_order for photo %s: %w", id, err)
		}
		n, err := res.RowsAffected()
		if err != nil {
			return err
		}
		if n == 0 {
			return fmt.Errorf("photo %s not found for event %s: %w", id, eventID, ErrNotFound)
		}
	}

	return tx.Commit()
}

func scanPhoto(s scanner) (*domain.Photo, error) {
	var p domain.Photo
	var variant string
	err := s.Scan(&p.ID, &p.EventID, &p.S3URL, &variant, &p.SortOrder)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	p.Variant = domain.PhotoVariant(variant)
	return &p, nil
}
