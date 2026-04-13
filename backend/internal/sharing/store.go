package sharing

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/rmrobinson/meridian/backend/internal/db"
	"github.com/rmrobinson/meridian/backend/internal/domain"
)

// SharingToken is the domain representation of a sharing token row.
type SharingToken struct {
	ID         string
	Name       string
	Email      string
	Visibility domain.Visibility // "public"|"friends"|"family"|"personal"
	CreatedAt  time.Time
	ExpiresAt  *time.Time
	DeletedAt  *time.Time
}

// Store provides CRUD operations for sharing_tokens.
type Store struct {
	db *sql.DB
}

// NewStore constructs a Store backed by the given database.
func NewStore(database *db.DB) *Store {
	return &Store{db: database.DB()}
}

// Create inserts a new sharing token row. t.ID must be set by the caller.
func (s *Store) Create(ctx context.Context, t *SharingToken) error {
	var expiresAt *string
	if t.ExpiresAt != nil {
		v := t.ExpiresAt.UTC().Format(time.RFC3339)
		expiresAt = &v
	}

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO sharing_tokens (id, name, email, visibility, created_at, expires_at)
		VALUES (?, ?, ?, ?, ?, ?)`,
		t.ID, t.Name, t.Email, string(t.Visibility),
		t.CreatedAt.UTC().Format(time.RFC3339),
		expiresAt,
	)
	if err != nil {
		return fmt.Errorf("inserting sharing token: %w", err)
	}
	return nil
}

// GetByID returns the sharing token with the given ID, or (nil, nil) if not found.
func (s *Store) GetByID(ctx context.Context, id string) (*SharingToken, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, name, email, visibility, created_at, expires_at, deleted_at
		FROM sharing_tokens WHERE id = ?`, id)

	t, err := scanToken(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("querying sharing token: %w", err)
	}
	return t, nil
}

// Revoke soft-deletes the token by setting deleted_at. No-ops silently if the
// ID does not exist.
func (s *Store) Revoke(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE sharing_tokens SET deleted_at = ? WHERE id = ?`,
		time.Now().UTC().Format(time.RFC3339), id)
	if err != nil {
		return fmt.Errorf("revoking sharing token: %w", err)
	}
	return nil
}

// List returns all sharing tokens, including revoked ones.
func (s *Store) List(ctx context.Context) ([]*SharingToken, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, email, visibility, created_at, expires_at, deleted_at
		FROM sharing_tokens ORDER BY created_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("listing sharing tokens: %w", err)
	}
	defer rows.Close()

	var tokens []*SharingToken
	for rows.Next() {
		t, err := scanToken(rows)
		if err != nil {
			return nil, fmt.Errorf("scanning sharing token: %w", err)
		}
		tokens = append(tokens, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating sharing tokens: %w", err)
	}
	return tokens, nil
}

// scanner is satisfied by both *sql.Row and *sql.Rows.
type scanner interface {
	Scan(dest ...any) error
}

func scanToken(s scanner) (*SharingToken, error) {
	var (
		t         SharingToken
		vis       string
		createdAt string
		expiresAt sql.NullString
		deletedAt sql.NullString
	)
	if err := s.Scan(&t.ID, &t.Name, &t.Email, &vis, &createdAt, &expiresAt, &deletedAt); err != nil {
		return nil, err
	}

	t.Visibility = domain.Visibility(vis)

	if ca, err := time.Parse(time.RFC3339, createdAt); err == nil {
		t.CreatedAt = ca.UTC()
	}
	if expiresAt.Valid {
		if ea, err := time.Parse(time.RFC3339, expiresAt.String); err == nil {
			v := ea.UTC()
			t.ExpiresAt = &v
		}
	}
	if deletedAt.Valid {
		if da, err := time.Parse(time.RFC3339, deletedAt.String); err == nil {
			v := da.UTC()
			t.DeletedAt = &v
		}
	}
	return &t, nil
}
