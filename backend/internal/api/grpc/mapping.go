package grpc

import (
	pb "github.com/rmrobinson/meridian/backend/gen/go/meridian/v1"
	"github.com/rmrobinson/meridian/backend/internal/domain"
)

func eventToProto(e *domain.Event, photos []*domain.Photo) *pb.Event {
	out := &pb.Event{
		Id:           e.ID,
		FamilyId:     e.FamilyID,
		LineKey:      e.LineKey,
		Type:         eventTypeToProto(e.Type),
		ActivityType: activityTypeToProto(e.ActivityType),
		Title:        e.Title,
		Visibility:   visibilityToProto(e.Visibility),
	}
	if e.ParentLineKey != nil {
		out.ParentLineKey = *e.ParentLineKey
	}
	if e.Label != nil {
		out.Label = *e.Label
	}
	if e.Icon != nil {
		out.Icon = *e.Icon
	}
	if e.EndIcon != nil {
		out.EndIcon = *e.EndIcon
	}
	if e.Description != nil {
		out.Description = *e.Description
	}
	if e.Date != nil {
		out.Date = *e.Date
	}
	if e.StartDate != nil {
		out.StartDate = *e.StartDate
	}
	if e.EndDate != nil {
		out.EndDate = *e.EndDate
	}
	if e.LocationLabel != nil || e.LocationLat != nil {
		out.Location = &pb.Location{}
		if e.LocationLabel != nil {
			out.Location.Label = *e.LocationLabel
		}
		if e.LocationLat != nil {
			out.Location.Lat = *e.LocationLat
		}
		if e.LocationLng != nil {
			out.Location.Lng = *e.LocationLng
		}
	}
	if e.ExternalURL != nil {
		out.ExternalUrl = *e.ExternalURL
	}
	if e.HeroImageURL != nil {
		out.HeroImageUrl = *e.HeroImageURL
	}
	if e.Metadata != nil {
		out.Metadata = *e.Metadata
	}
	if e.SourceService != nil {
		out.SourceService = *e.SourceService
	}
	if e.SourceEventID != nil {
		out.SourceEventId = *e.SourceEventID
	}
	if e.CanonicalID != nil {
		out.CanonicalId = *e.CanonicalID
	}
	for _, p := range photos {
		out.Photos = append(out.Photos, photoToProto(p))
	}
	return out
}

func photoToProto(p *domain.Photo) *pb.Photo {
	return &pb.Photo{
		Id:        p.ID,
		EventId:   p.EventID,
		S3Url:     p.S3URL,
		Variant:   photoVariantToProto(p.Variant),
		SortOrder: int32(p.SortOrder),
	}
}

func eventTypeToProto(t domain.EventType) pb.EventType {
	switch t {
	case domain.EventTypeSpan:
		return pb.EventType_EVENT_TYPE_SPAN
	case domain.EventTypePoint:
		return pb.EventType_EVENT_TYPE_POINT
	default:
		return pb.EventType_EVENT_TYPE_UNSPECIFIED
	}
}

func protoToEventType(t pb.EventType) domain.EventType {
	switch t {
	case pb.EventType_EVENT_TYPE_SPAN:
		return domain.EventTypeSpan
	case pb.EventType_EVENT_TYPE_POINT:
		return domain.EventTypePoint
	default:
		return domain.EventTypePoint // default to point for unspecified
	}
}

func activityTypeToProto(a domain.ActivityType) pb.ActivityType {
	switch a {
	case domain.ActivityTypeRun:
		return pb.ActivityType_ACTIVITY_TYPE_RUN
	case domain.ActivityTypeCycle:
		return pb.ActivityType_ACTIVITY_TYPE_CYCLE
	case domain.ActivityTypeHike:
		return pb.ActivityType_ACTIVITY_TYPE_HIKE
	case domain.ActivityTypeSki:
		return pb.ActivityType_ACTIVITY_TYPE_SKI
	case domain.ActivityTypeScuba:
		return pb.ActivityType_ACTIVITY_TYPE_SCUBA
	case domain.ActivityTypeClimb:
		return pb.ActivityType_ACTIVITY_TYPE_CLIMB
	case domain.ActivityTypeGolf:
		return pb.ActivityType_ACTIVITY_TYPE_GOLF
	case domain.ActivityTypeSquash:
		return pb.ActivityType_ACTIVITY_TYPE_SQUASH
	case domain.ActivityTypeConcert:
		return pb.ActivityType_ACTIVITY_TYPE_CONCERT
	case domain.ActivityTypeFlight:
		return pb.ActivityType_ACTIVITY_TYPE_FLIGHT
	case domain.ActivityTypeBook:
		return pb.ActivityType_ACTIVITY_TYPE_BOOK
	case domain.ActivityTypeMovie:
		return pb.ActivityType_ACTIVITY_TYPE_MOVIE
	case domain.ActivityTypeTV:
		return pb.ActivityType_ACTIVITY_TYPE_TV
	default:
		return pb.ActivityType_ACTIVITY_TYPE_UNSPECIFIED
	}
}

func protoToActivityType(a pb.ActivityType) domain.ActivityType {
	switch a {
	case pb.ActivityType_ACTIVITY_TYPE_RUN:
		return domain.ActivityTypeRun
	case pb.ActivityType_ACTIVITY_TYPE_CYCLE:
		return domain.ActivityTypeCycle
	case pb.ActivityType_ACTIVITY_TYPE_HIKE:
		return domain.ActivityTypeHike
	case pb.ActivityType_ACTIVITY_TYPE_SKI:
		return domain.ActivityTypeSki
	case pb.ActivityType_ACTIVITY_TYPE_SCUBA:
		return domain.ActivityTypeScuba
	case pb.ActivityType_ACTIVITY_TYPE_CLIMB:
		return domain.ActivityTypeClimb
	case pb.ActivityType_ACTIVITY_TYPE_GOLF:
		return domain.ActivityTypeGolf
	case pb.ActivityType_ACTIVITY_TYPE_SQUASH:
		return domain.ActivityTypeSquash
	case pb.ActivityType_ACTIVITY_TYPE_CONCERT:
		return domain.ActivityTypeConcert
	case pb.ActivityType_ACTIVITY_TYPE_FLIGHT:
		return domain.ActivityTypeFlight
	case pb.ActivityType_ACTIVITY_TYPE_BOOK:
		return domain.ActivityTypeBook
	case pb.ActivityType_ACTIVITY_TYPE_MOVIE:
		return domain.ActivityTypeMovie
	case pb.ActivityType_ACTIVITY_TYPE_TV:
		return domain.ActivityTypeTV
	default:
		return domain.ActivityTypeUnspecified
	}
}

func visibilityToProto(v domain.Visibility) pb.Visibility {
	switch v {
	case domain.VisibilityPublic:
		return pb.Visibility_VISIBILITY_PUBLIC
	case domain.VisibilityFriends:
		return pb.Visibility_VISIBILITY_FRIENDS
	case domain.VisibilityFamily:
		return pb.Visibility_VISIBILITY_FAMILY
	case domain.VisibilityPersonal:
		return pb.Visibility_VISIBILITY_PERSONAL
	default:
		return pb.Visibility_VISIBILITY_UNSPECIFIED
	}
}

func protoToVisibility(v pb.Visibility) domain.Visibility {
	switch v {
	case pb.Visibility_VISIBILITY_PUBLIC:
		return domain.VisibilityPublic
	case pb.Visibility_VISIBILITY_FRIENDS:
		return domain.VisibilityFriends
	case pb.Visibility_VISIBILITY_FAMILY:
		return domain.VisibilityFamily
	case pb.Visibility_VISIBILITY_PERSONAL:
		return domain.VisibilityPersonal
	default:
		return domain.VisibilityPersonal
	}
}

func photoVariantToProto(v domain.PhotoVariant) pb.PhotoVariant {
	switch v {
	case domain.PhotoVariantHero:
		return pb.PhotoVariant_PHOTO_VARIANT_HERO
	case domain.PhotoVariantThumb:
		return pb.PhotoVariant_PHOTO_VARIANT_THUMB
	case domain.PhotoVariantOriginal:
		return pb.PhotoVariant_PHOTO_VARIANT_ORIGINAL
	default:
		return pb.PhotoVariant_PHOTO_VARIANT_UNSPECIFIED
	}
}

func protoToPhotoVariant(v pb.PhotoVariant) domain.PhotoVariant {
	switch v {
	case pb.PhotoVariant_PHOTO_VARIANT_HERO:
		return domain.PhotoVariantHero
	case pb.PhotoVariant_PHOTO_VARIANT_THUMB:
		return domain.PhotoVariantThumb
	case pb.PhotoVariant_PHOTO_VARIANT_ORIGINAL:
		return domain.PhotoVariantOriginal
	default:
		return domain.PhotoVariantOriginal
	}
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func float64Ptr(f float64) *float64 {
	return &f
}
