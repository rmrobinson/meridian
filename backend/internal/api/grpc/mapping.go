package grpc

import (
	pb "github.com/rmrobinson/meridian/backend/gen/go/meridian/v1"
	"github.com/rmrobinson/meridian/backend/internal/domain"
)

func eventToProto(e *domain.Event, photos []*domain.Photo) *pb.Event {
	out := &pb.Event{
		Id:            e.ID,
		FamilyId:      e.FamilyID,
		LineKey:       e.LineKey,
		Type:          string(e.Type),
		Title:         e.Title,
		Visibility:    string(e.Visibility),
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
		Variant:   string(p.Variant),
		SortOrder: int32(p.SortOrder),
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
