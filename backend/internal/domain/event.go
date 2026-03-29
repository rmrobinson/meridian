package domain

import "time"

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
	Date          *string
	StartDate     *string
	EndDate       *string
	LocationLabel *string
	LocationLat   *float64
	LocationLng   *float64
	ExternalURL   *string
	HeroImageURL  *string
	Metadata      *string // raw JSON
	Visibility    Visibility
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
