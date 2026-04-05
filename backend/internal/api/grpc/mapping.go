package grpc

import (
	"encoding/json"

	pb "github.com/rmrobinson/meridian/backend/gen/go/meridian/v1"
	"github.com/rmrobinson/meridian/backend/internal/domain"
)

func eventToProto(e *domain.Event, photos []*domain.Photo) *pb.Event {
	out := &pb.Event{
		Id:         e.ID,
		FamilyId:   e.FamilyID,
		LineKey:    e.LineKey,
		Type:       eventTypeToProto(e.Type),
		Title:      e.Title,
		Visibility: visibilityToProto(e.Visibility),
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
	jsonToEventMetadata(e, out)
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

// extractCreateMetadata converts the oneof metadata in a CreateEventRequest to a JSON string.
func extractCreateMetadata(req *pb.CreateEventRequest) *string {
	switch v := req.Metadata.(type) {
	case *pb.CreateEventRequest_SpineMetadata:
		return marshalMetadata(&domain.SpineMetadata{
			MilestoneType: spineMilestoneTypeFromProto(v.SpineMetadata.GetMilestoneType()),
			From:          v.SpineMetadata.GetFrom(),
			To:            v.SpineMetadata.GetTo(),
		})
	case *pb.CreateEventRequest_EmploymentMetadata:
		return marshalMetadata(&domain.EmploymentMetadata{
			Role:        v.EmploymentMetadata.GetRole(),
			CompanyName: v.EmploymentMetadata.GetCompanyName(),
			CompanyURL:  v.EmploymentMetadata.GetCompanyUrl(),
		})
	case *pb.CreateEventRequest_EducationMetadata:
		return marshalMetadata(&domain.EducationMetadata{
			Institution: v.EducationMetadata.GetInstitution(),
			Degree:      v.EducationMetadata.GetDegree(),
		})
	case *pb.CreateEventRequest_TravelMetadata:
		return marshalMetadata(&domain.TravelMetadata{
			Countries: v.TravelMetadata.GetCountries(),
			Cities:    v.TravelMetadata.GetCities(),
		})
	case *pb.CreateEventRequest_FlightMetadata:
		return marshalMetadata(protoToFlightMetadata(v.FlightMetadata))
	case *pb.CreateEventRequest_BookMetadata:
		return marshalMetadata(protoToBookMetadata(v.BookMetadata))
	case *pb.CreateEventRequest_FilmTvMetadata:
		return marshalMetadata(protoToFilmTVMetadata(v.FilmTvMetadata))
	case *pb.CreateEventRequest_ConcertMetadata:
		return marshalMetadata(protoToConcertMetadata(v.ConcertMetadata))
	case *pb.CreateEventRequest_FitnessMetadata:
		return marshalMetadata(protoToFitnessMetadata(v.FitnessMetadata))
	}
	return nil
}

// extractUpdateMetadata converts the oneof metadata in an UpdateEventRequest to a JSON string.
func extractUpdateMetadata(req *pb.UpdateEventRequest) *string {
	switch v := req.Metadata.(type) {
	case *pb.UpdateEventRequest_SpineMetadata:
		return marshalMetadata(&domain.SpineMetadata{
			MilestoneType: spineMilestoneTypeFromProto(v.SpineMetadata.GetMilestoneType()),
			From:          v.SpineMetadata.GetFrom(),
			To:            v.SpineMetadata.GetTo(),
		})
	case *pb.UpdateEventRequest_EmploymentMetadata:
		return marshalMetadata(&domain.EmploymentMetadata{
			Role:        v.EmploymentMetadata.GetRole(),
			CompanyName: v.EmploymentMetadata.GetCompanyName(),
			CompanyURL:  v.EmploymentMetadata.GetCompanyUrl(),
		})
	case *pb.UpdateEventRequest_EducationMetadata:
		return marshalMetadata(&domain.EducationMetadata{
			Institution: v.EducationMetadata.GetInstitution(),
			Degree:      v.EducationMetadata.GetDegree(),
		})
	case *pb.UpdateEventRequest_TravelMetadata:
		return marshalMetadata(&domain.TravelMetadata{
			Countries: v.TravelMetadata.GetCountries(),
			Cities:    v.TravelMetadata.GetCities(),
		})
	case *pb.UpdateEventRequest_FlightMetadata:
		return marshalMetadata(protoToFlightMetadata(v.FlightMetadata))
	case *pb.UpdateEventRequest_BookMetadata:
		return marshalMetadata(protoToBookMetadata(v.BookMetadata))
	case *pb.UpdateEventRequest_FilmTvMetadata:
		return marshalMetadata(protoToFilmTVMetadata(v.FilmTvMetadata))
	case *pb.UpdateEventRequest_ConcertMetadata:
		return marshalMetadata(protoToConcertMetadata(v.ConcertMetadata))
	case *pb.UpdateEventRequest_FitnessMetadata:
		return marshalMetadata(protoToFitnessMetadata(v.FitnessMetadata))
	}
	return nil
}

// jsonToEventMetadata parses e.Metadata JSON and sets the corresponding oneof field on out.
func jsonToEventMetadata(e *domain.Event, out *pb.Event) {
	if e.Metadata == nil || *e.Metadata == "" {
		return
	}
	switch e.FamilyID {
	case "spine":
		m, err := domain.ParseMetadata[domain.SpineMetadata](e)
		if err != nil {
			return
		}
		out.Metadata = &pb.Event_SpineMetadata{SpineMetadata: &pb.SpineMetadata{
			MilestoneType: spineMilestoneTypeToProto(m.MilestoneType),
			From:          m.From,
			To:            m.To,
		}}
	case "employment":
		m, err := domain.ParseMetadata[domain.EmploymentMetadata](e)
		if err != nil {
			return
		}
		out.Metadata = &pb.Event_EmploymentMetadata{EmploymentMetadata: &pb.EmploymentMetadata{
			Role:        m.Role,
			CompanyName: m.CompanyName,
			CompanyUrl:  m.CompanyURL,
		}}
	case "education":
		m, err := domain.ParseMetadata[domain.EducationMetadata](e)
		if err != nil {
			return
		}
		out.Metadata = &pb.Event_EducationMetadata{EducationMetadata: &pb.EducationMetadata{
			Institution: m.Institution,
			Degree:      m.Degree,
		}}
	case "travel":
		m, err := domain.ParseMetadata[domain.TravelMetadata](e)
		if err != nil {
			return
		}
		out.Metadata = &pb.Event_TravelMetadata{TravelMetadata: &pb.TravelMetadata{
			Countries: m.Countries,
			Cities:    m.Cities,
		}}
	case "flights":
		m, err := domain.ParseMetadata[domain.FlightMetadata](e)
		if err != nil {
			return
		}
		out.Metadata = &pb.Event_FlightMetadata{FlightMetadata: &pb.FlightMetadata{
			Airline:            m.Airline,
			FlightNumber:       m.FlightNumber,
			AircraftType:       m.AircraftType,
			TailNumber:         m.TailNumber,
			OriginIata:         m.OriginIATA,
			DestinationIata:    m.DestinationIATA,
			ScheduledDeparture: m.ScheduledDeparture,
			ScheduledArrival:   m.ScheduledArrival,
			ActualDeparture:    m.ActualDeparture,
			ActualArrival:      m.ActualArrival,
		}}
	case "books":
		m, err := domain.ParseMetadata[domain.BookMetadata](e)
		if err != nil {
			return
		}
		out.Metadata = &pb.Event_BookMetadata{BookMetadata: &pb.BookMetadata{
			Isbn:         m.ISBN,
			Author:       m.Author,
			CoverImageUrl: m.CoverImageURL,
			PreviewUrl:   m.PreviewURL,
			Rating:       int32(m.Rating),
			Review:       m.Review,
		}}
	case "film_tv":
		m, err := domain.ParseMetadata[domain.FilmTVMetadata](e)
		if err != nil {
			return
		}
		pbMeta := &pb.FilmTVMetadata{
			TmdbId:    m.TMDBID,
			Type:      filmTVTypeToProto(m.Type),
			PosterUrl: m.PosterURL,
			Director:  m.Director,
			Network:   m.Network,
			Year:      int32(m.Year),
			Rating:    int32(m.Rating),
			Review:    m.Review,
		}
		if m.SeasonsWatched != nil {
			v := int32(*m.SeasonsWatched)
			pbMeta.SeasonsWatched = &v
		}
		out.Metadata = &pb.Event_FilmTvMetadata{FilmTvMetadata: pbMeta}
	case "hobbies":
		m, err := domain.ParseMetadata[domain.ConcertMetadata](e)
		if err != nil {
			return
		}
		out.Metadata = &pb.Event_ConcertMetadata{ConcertMetadata: domainConcertToProto(m)}
	case "fitness":
		m, err := domain.ParseMetadata[domain.FitnessMetadata](e)
		if err != nil {
			return
		}
		out.Metadata = &pb.Event_FitnessMetadata{FitnessMetadata: domainFitnessToProto(m)}
	}
}

// --- shared proto→domain converters ---

func protoToConcertMetadata(p *pb.ConcertMetadata) *domain.ConcertMetadata {
	m := &domain.ConcertMetadata{
		MainAct:     p.GetMainAct(),
		OpeningActs: p.GetOpeningActs(),
		PlaylistURL: p.GetPlaylistUrl(),
	}
	if v := p.GetVenue(); v != nil {
		lat := v.GetLat()
		lng := v.GetLng()
		m.Venue = &domain.ConcertLocation{
			Label: v.GetLabel(),
			Lat:   &lat,
			Lng:   &lng,
		}
	}
	return m
}

func domainConcertToProto(m *domain.ConcertMetadata) *pb.ConcertMetadata {
	p := &pb.ConcertMetadata{
		MainAct:     m.MainAct,
		OpeningActs: m.OpeningActs,
		PlaylistUrl: m.PlaylistURL,
	}
	if m.Venue != nil {
		p.Venue = &pb.Location{
			Label: m.Venue.Label,
		}
		if m.Venue.Lat != nil {
			p.Venue.Lat = *m.Venue.Lat
		}
		if m.Venue.Lng != nil {
			p.Venue.Lng = *m.Venue.Lng
		}
	}
	return p
}

func protoToFlightMetadata(p *pb.FlightMetadata) *domain.FlightMetadata {
	return &domain.FlightMetadata{
		Airline:            p.GetAirline(),
		FlightNumber:       p.GetFlightNumber(),
		AircraftType:       p.GetAircraftType(),
		TailNumber:         p.GetTailNumber(),
		OriginIATA:         p.GetOriginIata(),
		DestinationIATA:    p.GetDestinationIata(),
		ScheduledDeparture: p.GetScheduledDeparture(),
		ScheduledArrival:   p.GetScheduledArrival(),
		ActualDeparture:    p.GetActualDeparture(),
		ActualArrival:      p.GetActualArrival(),
	}
}

func protoToBookMetadata(p *pb.BookMetadata) *domain.BookMetadata {
	return &domain.BookMetadata{
		ISBN:          p.GetIsbn(),
		Author:        p.GetAuthor(),
		CoverImageURL: p.GetCoverImageUrl(),
		PreviewURL:    p.GetPreviewUrl(),
		Rating:        int(p.GetRating()),
		Review:        p.GetReview(),
	}
}

func protoToFilmTVMetadata(p *pb.FilmTVMetadata) *domain.FilmTVMetadata {
	m := &domain.FilmTVMetadata{
		TMDBID:    p.GetTmdbId(),
		Type:      filmTVTypeFromProto(p.GetType()),
		PosterURL: p.GetPosterUrl(),
		Director:  p.GetDirector(),
		Network:   p.GetNetwork(),
		Year:      int(p.GetYear()),
		Rating:    int(p.GetRating()),
		Review:    p.GetReview(),
	}
	if p.SeasonsWatched != nil {
		v := int(p.GetSeasonsWatched())
		m.SeasonsWatched = &v
	}
	return m
}

func protoToFitnessMetadata(p *pb.FitnessMetadata) *domain.FitnessMetadata {
	m := &domain.FitnessMetadata{
		Activity:     fitnessActivityFromProto(p.GetActivity()),
		Duration:     p.GetDuration(),
		GarminURL:    p.GetGarminActivityUrl(),
		Bike:         p.GetBike(),
		TrailName:    p.GetTrailName(),
		AllTrailsURL: p.GetAlltrailsUrl(),
		Resort:       p.GetResort(),
		DiveSite:     p.GetDiveSite(),
		ClimbingType: climbingTypeFromProto(p.GetClimbingType()),
		RouteName:    p.GetRouteName(),
		ProblemName:  p.GetProblemName(),
		Grade:        p.GetGrade(),
		CourseName:   p.GetCourseName(),
		Opponent:     p.GetOpponent(),
		Result:       p.GetResult(),
	}
	if p.DistanceKm != nil {
		v := p.GetDistanceKm()
		m.DistanceKM = &v
	}
	if p.ElevationGainM != nil {
		v := int(p.GetElevationGainM())
		m.ElevationGainM = &v
	}
	if p.AvgHeartRate != nil {
		v := int(p.GetAvgHeartRate())
		m.AvgHeartRate = &v
	}
	if p.AvgPaceMinKm != nil {
		v := p.GetAvgPaceMinKm()
		m.AvgPaceMinKM = &v
	}
	if p.AvgSpeedKmh != nil {
		v := p.GetAvgSpeedKmh()
		m.AvgSpeedKMH = &v
	}
	if p.VerticalDropM != nil {
		v := int(p.GetVerticalDropM())
		m.VerticalDropM = &v
	}
	if p.Runs != nil {
		v := int(p.GetRuns())
		m.Runs = &v
	}
	if p.MaxDepthM != nil {
		v := p.GetMaxDepthM()
		m.MaxDepthM = &v
	}
	if p.AvgDepthM != nil {
		v := p.GetAvgDepthM()
		m.AvgDepthM = &v
	}
	if p.Holes != nil {
		v := int(p.GetHoles())
		m.Holes = &v
	}
	if p.Score != nil {
		v := int(p.GetScore())
		m.Score = &v
	}
	return m
}

func domainFitnessToProto(m *domain.FitnessMetadata) *pb.FitnessMetadata {
	p := &pb.FitnessMetadata{
		Activity:          fitnessActivityToProto(m.Activity),
		Duration:          m.Duration,
		GarminActivityUrl: m.GarminURL,
		Bike:              m.Bike,
		TrailName:         m.TrailName,
		AlltrailsUrl:      m.AllTrailsURL,
		Resort:            m.Resort,
		DiveSite:          m.DiveSite,
		ClimbingType:      climbingTypeToProto(m.ClimbingType),
		RouteName:         m.RouteName,
		ProblemName:       m.ProblemName,
		Grade:             m.Grade,
		CourseName:        m.CourseName,
		Opponent:          m.Opponent,
		Result:            m.Result,
	}
	if m.DistanceKM != nil {
		p.DistanceKm = m.DistanceKM
	}
	if m.ElevationGainM != nil {
		v := int32(*m.ElevationGainM)
		p.ElevationGainM = &v
	}
	if m.AvgHeartRate != nil {
		v := int32(*m.AvgHeartRate)
		p.AvgHeartRate = &v
	}
	if m.AvgPaceMinKM != nil {
		p.AvgPaceMinKm = m.AvgPaceMinKM
	}
	if m.AvgSpeedKMH != nil {
		p.AvgSpeedKmh = m.AvgSpeedKMH
	}
	if m.VerticalDropM != nil {
		v := int32(*m.VerticalDropM)
		p.VerticalDropM = &v
	}
	if m.Runs != nil {
		v := int32(*m.Runs)
		p.Runs = &v
	}
	if m.MaxDepthM != nil {
		p.MaxDepthM = m.MaxDepthM
	}
	if m.AvgDepthM != nil {
		p.AvgDepthM = m.AvgDepthM
	}
	if m.Holes != nil {
		v := int32(*m.Holes)
		p.Holes = &v
	}
	if m.Score != nil {
		v := int32(*m.Score)
		p.Score = &v
	}
	return p
}

func spineMilestoneTypeToProto(s string) pb.SpineMilestoneType {
	switch s {
	case "birth":
		return pb.SpineMilestoneType_SPINE_MILESTONE_TYPE_BIRTH
	case "death":
		return pb.SpineMilestoneType_SPINE_MILESTONE_TYPE_DEATH
	case "marriage":
		return pb.SpineMilestoneType_SPINE_MILESTONE_TYPE_MARRIAGE
	case "relocation":
		return pb.SpineMilestoneType_SPINE_MILESTONE_TYPE_RELOCATION
	case "graduation":
		return pb.SpineMilestoneType_SPINE_MILESTONE_TYPE_GRADUATION
	case "anniversary":
		return pb.SpineMilestoneType_SPINE_MILESTONE_TYPE_ANNIVERSARY
	default:
		return pb.SpineMilestoneType_SPINE_MILESTONE_TYPE_UNSPECIFIED
	}
}

func spineMilestoneTypeFromProto(t pb.SpineMilestoneType) string {
	switch t {
	case pb.SpineMilestoneType_SPINE_MILESTONE_TYPE_BIRTH:
		return "birth"
	case pb.SpineMilestoneType_SPINE_MILESTONE_TYPE_DEATH:
		return "death"
	case pb.SpineMilestoneType_SPINE_MILESTONE_TYPE_MARRIAGE:
		return "marriage"
	case pb.SpineMilestoneType_SPINE_MILESTONE_TYPE_RELOCATION:
		return "relocation"
	case pb.SpineMilestoneType_SPINE_MILESTONE_TYPE_GRADUATION:
		return "graduation"
	case pb.SpineMilestoneType_SPINE_MILESTONE_TYPE_ANNIVERSARY:
		return "anniversary"
	default:
		return ""
	}
}

func fitnessActivityToProto(s string) pb.FitnessActivity {
	switch s {
	case "run":
		return pb.FitnessActivity_FITNESS_ACTIVITY_RUN
	case "cycle":
		return pb.FitnessActivity_FITNESS_ACTIVITY_CYCLE
	case "hike":
		return pb.FitnessActivity_FITNESS_ACTIVITY_HIKE
	case "ski":
		return pb.FitnessActivity_FITNESS_ACTIVITY_SKI
	case "scuba":
		return pb.FitnessActivity_FITNESS_ACTIVITY_SCUBA
	case "climb":
		return pb.FitnessActivity_FITNESS_ACTIVITY_CLIMB
	case "golf":
		return pb.FitnessActivity_FITNESS_ACTIVITY_GOLF
	case "squash":
		return pb.FitnessActivity_FITNESS_ACTIVITY_SQUASH
	default:
		return pb.FitnessActivity_FITNESS_ACTIVITY_UNSPECIFIED
	}
}

func fitnessActivityFromProto(t pb.FitnessActivity) string {
	switch t {
	case pb.FitnessActivity_FITNESS_ACTIVITY_RUN:
		return "run"
	case pb.FitnessActivity_FITNESS_ACTIVITY_CYCLE:
		return "cycle"
	case pb.FitnessActivity_FITNESS_ACTIVITY_HIKE:
		return "hike"
	case pb.FitnessActivity_FITNESS_ACTIVITY_SKI:
		return "ski"
	case pb.FitnessActivity_FITNESS_ACTIVITY_SCUBA:
		return "scuba"
	case pb.FitnessActivity_FITNESS_ACTIVITY_CLIMB:
		return "climb"
	case pb.FitnessActivity_FITNESS_ACTIVITY_GOLF:
		return "golf"
	case pb.FitnessActivity_FITNESS_ACTIVITY_SQUASH:
		return "squash"
	default:
		return ""
	}
}

func climbingTypeToProto(s string) pb.ClimbingType {
	switch s {
	case "sport":
		return pb.ClimbingType_CLIMBING_TYPE_SPORT
	case "bouldering":
		return pb.ClimbingType_CLIMBING_TYPE_BOULDERING
	case "gym":
		return pb.ClimbingType_CLIMBING_TYPE_GYM
	default:
		return pb.ClimbingType_CLIMBING_TYPE_UNSPECIFIED
	}
}

func climbingTypeFromProto(t pb.ClimbingType) string {
	switch t {
	case pb.ClimbingType_CLIMBING_TYPE_SPORT:
		return "sport"
	case pb.ClimbingType_CLIMBING_TYPE_BOULDERING:
		return "bouldering"
	case pb.ClimbingType_CLIMBING_TYPE_GYM:
		return "gym"
	default:
		return ""
	}
}

func filmTVTypeToProto(t string) pb.FilmTVType {
	switch t {
	case "movie":
		return pb.FilmTVType_FILM_TV_TYPE_MOVIE
	case "tv":
		return pb.FilmTVType_FILM_TV_TYPE_TV
	default:
		return pb.FilmTVType_FILM_TV_TYPE_UNSPECIFIED
	}
}

func filmTVTypeFromProto(t pb.FilmTVType) string {
	switch t {
	case pb.FilmTVType_FILM_TV_TYPE_MOVIE:
		return "movie"
	case pb.FilmTVType_FILM_TV_TYPE_TV:
		return "tv"
	default:
		return ""
	}
}

func marshalMetadata[T any](m *T) *string {
	b, err := json.Marshal(m)
	if err != nil {
		return nil
	}
	s := string(b)
	return &s
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
