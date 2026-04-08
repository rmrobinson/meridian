package domain

import (
	"context"
	"time"
)

// Enricher populates additional fields on an Event (e.g. fetching metadata
// from an external API and uploading images to S3).
type Enricher interface {
	Enrich(ctx context.Context, event *Event) error
}

type EventType string

const (
	EventTypeSpan  EventType = "span"
	EventTypePoint EventType = "point"
)

type Visibility string

const (
	VisibilityPublic   Visibility = "public"
	VisibilityFriends  Visibility = "friends"
	VisibilityFamily   Visibility = "family"
	VisibilityPersonal Visibility = "personal"
)

type ConflictStrategy string

const (
	ConflictStrategyUpsert ConflictStrategy = "upsert"
	ConflictStrategySkip   ConflictStrategy = "skip"
)

type PhotoVariant string

const (
	PhotoVariantHero     PhotoVariant = "hero"
	PhotoVariantThumb    PhotoVariant = "thumb"
	PhotoVariantOriginal PhotoVariant = "original"
)

type Event struct {
	ID            string
	FamilyID      string
	LineKey       string
	ParentLineKey *string
	Type          EventType
	Title         string
	Label         *string
	Icon          *string
	EndIcon       *string
	Description   *string
	Date          *string
	StartDate     *string
	EndDate       *string
	LocationLabel *string
	LocationLat   *float64
	LocationLng   *float64
	ExternalURL   *string
	HeroImageURL  *string
	Metadata     *string // raw JSON
	MetadataType *string // e.g. "life", "flight", "fitness"; nil when no metadata
	Visibility   Visibility
	SourceService  *string
	SourceEventID  *string
	CanonicalID    *string
	CreatedAt     time.Time
	UpdatedAt     time.Time
	DeletedAt     *time.Time
}

type Photo struct {
	ID        string
	EventID   string
	S3URL     string
	Variant   PhotoVariant
	SortOrder int
}
