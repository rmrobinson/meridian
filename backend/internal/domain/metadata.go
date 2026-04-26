package domain

import "encoding/json"

// ParseMetadata deserialises the event's raw metadata JSON into a typed struct.
// Returns a zero-value T (not nil) when the event has no metadata.
func ParseMetadata[T any](event *Event) (*T, error) {
	var m T
	if event.Metadata == nil || *event.Metadata == "" {
		return &m, nil
	}
	if err := json.Unmarshal([]byte(*event.Metadata), &m); err != nil {
		return nil, err
	}
	return &m, nil
}

// SetMetadata serialises m and writes it back into event.Metadata.
func SetMetadata[T any](event *Event, m *T) error {
	b, err := json.Marshal(m)
	if err != nil {
		return err
	}
	s := string(b)
	event.Metadata = &s
	return nil
}

// --- Per-family metadata structs ---

type LifeMetadata struct {
	MilestoneType string `json:"milestone_type,omitempty"`
	From          string `json:"from,omitempty"`
	To            string `json:"to,omitempty"`
}

type EmploymentMetadata struct {
	Role        string `json:"role,omitempty"`
	CompanyName string `json:"company_name,omitempty"`
	CompanyURL  string `json:"company_url,omitempty"`
}

type EducationMetadata struct {
	Institution string `json:"institution,omitempty"`
	Degree      string `json:"degree,omitempty"`
}

type TravelMetadata struct {
	Countries []string `json:"countries,omitempty"`
	Cities    []string `json:"cities,omitempty"`
}

type FlightMetadata struct {
	Airline             string `json:"airline,omitempty"`
	FlightNumber        string `json:"flight_number,omitempty"`
	AircraftType        string `json:"aircraft_type,omitempty"`
	TailNumber          string `json:"tail_number,omitempty"`
	OriginIATA          string `json:"origin_iata,omitempty"`
	DestinationIATA     string `json:"destination_iata,omitempty"`
	ScheduledDeparture  string `json:"scheduled_departure,omitempty"`
	ScheduledArrival    string `json:"scheduled_arrival,omitempty"`
	ActualDeparture     string `json:"actual_departure,omitempty"`
	ActualArrival       string `json:"actual_arrival,omitempty"`
	BookingCode         string `json:"booking_code,omitempty"`
}

type BookMetadata struct {
	ISBN          string `json:"isbn,omitempty"`
	Author        string `json:"author,omitempty"`
	CoverImageURL string `json:"cover_image_url,omitempty"`
	PreviewURL    string `json:"preview_url,omitempty"`
	Rating        int    `json:"rating,omitempty"`
	Review        string `json:"review,omitempty"`
	Title         string `json:"title,omitempty"`
}

type FilmTVMetadata struct {
	TMDBID         string `json:"tmdb_id,omitempty"`
	Type           string `json:"type,omitempty"` // "movie" or "tv"
	PosterURL      string `json:"poster_url,omitempty"`
	Director       string `json:"director,omitempty"`
	Network        string `json:"network,omitempty"`
	Year           int    `json:"year,omitempty"`
	SeasonsWatched *int   `json:"seasons_watched,omitempty"`
	Rating         int    `json:"rating,omitempty"`
	Review         string `json:"review,omitempty"`
}

type ConcertLocation struct {
	Label string   `json:"label,omitempty"`
	Lat   *float64 `json:"lat,omitempty"`
	Lng   *float64 `json:"lng,omitempty"`
}

type ConcertMetadata struct {
	MainAct     string           `json:"main_act,omitempty"`
	OpeningActs []string         `json:"opening_acts,omitempty"`
	Venue       *ConcertLocation `json:"venue,omitempty"`
	PlaylistURL string           `json:"playlist_url,omitempty"`
}

type FitnessMetadata struct {
	Activity       string   `json:"activity,omitempty"`
	Duration       string   `json:"duration,omitempty"`
	DistanceKM     *float64 `json:"distance_km,omitempty"`
	ElevationGainM *int     `json:"elevation_gain_m,omitempty"`
	AvgHeartRate   *int     `json:"avg_heart_rate,omitempty"`
	GarminURL      string   `json:"garmin_activity_url,omitempty"`
	// running
	AvgPaceMinKM *float64 `json:"avg_pace_min_km,omitempty"`
	// cycling
	Bike        string   `json:"bike,omitempty"`
	AvgSpeedKMH *float64 `json:"avg_speed_kmh,omitempty"`
	// hiking
	TrailName    string `json:"trail_name,omitempty"`
	AllTrailsURL string `json:"alltrails_url,omitempty"`
	// skiing
	Resort         string `json:"resort,omitempty"`
	VerticalDropM  *int   `json:"vertical_drop_m,omitempty"`
	Runs           *int   `json:"runs,omitempty"`
	// scuba
	DiveSite  string   `json:"dive_site,omitempty"`
	MaxDepthM *float64 `json:"max_depth_m,omitempty"`
	AvgDepthM *float64 `json:"avg_depth_m,omitempty"`
	// climbing
	ClimbingType string `json:"climbing_type,omitempty"`
	RouteName    string `json:"route_name,omitempty"`
	ProblemName  string `json:"problem_name,omitempty"`
	Grade        string `json:"grade,omitempty"`
	// golf
	CourseName string `json:"course_name,omitempty"`
	Holes      *int   `json:"holes,omitempty"`
	Score      *int   `json:"score,omitempty"`
	// squash
	Opponent string `json:"opponent,omitempty"`
	Result   string `json:"result,omitempty"`
}
