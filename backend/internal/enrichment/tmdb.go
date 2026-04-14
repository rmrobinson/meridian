package enrichment

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/rmrobinson/meridian/backend/internal/domain"
)

// TMDBEnricher fetches film/TV metadata from the TMDB API and uploads the
// poster image to S3.
type TMDBEnricher struct {
	readAccessToken string
	uploader        *S3Uploader
	baseURL         string // overridable for tests
	client          *http.Client
}

// NewTMDBEnricher creates a TMDBEnricher. readAccessToken is the API Read
// Access Token from https://www.themoviedb.org/settings/api (v4 auth).
func NewTMDBEnricher(readAccessToken string, uploader *S3Uploader) *TMDBEnricher {
	return &TMDBEnricher{
		readAccessToken: readAccessToken,
		uploader:        uploader,
		baseURL:         "https://api.themoviedb.org/3",
		client:          &http.Client{},
	}
}

type tmdbMovieResponse struct {
	Title       string `json:"title"`
	ReleaseDate string `json:"release_date"` // "YYYY-MM-DD"
	PosterPath  string `json:"poster_path"`
	Credits     struct {
		Crew []struct {
			Job  string `json:"job"`
			Name string `json:"name"`
		} `json:"crew"`
	} `json:"credits"`
}

type tmdbTVResponse struct {
	Name         string `json:"name"`
	FirstAirDate string `json:"first_air_date"`
	PosterPath   string `json:"poster_path"`
	Networks     []struct {
		Name string `json:"name"`
	} `json:"networks"`
	NumberOfSeasons int `json:"number_of_seasons"`
}

// Enrich fetches metadata for the film or TV show identified by metadata.tmdb_id
// and populates poster_url, director/network, and year.
func (e *TMDBEnricher) Enrich(ctx context.Context, event *domain.Event) error {
	m, err := domain.ParseMetadata[domain.FilmTVMetadata](event)
	if err != nil {
		return fmt.Errorf("parsing film_tv metadata: %w", err)
	}
	if m.TMDBID == "" {
		return fmt.Errorf("film_tv event missing tmdb_id in metadata")
	}

	switch m.Type {
	case "movie":
		return e.enrichMovie(ctx, event, m)
	case "tv":
		return e.enrichTV(ctx, event, m)
	default:
		return fmt.Errorf("unknown film_tv type %q, must be movie or tv", m.Type)
	}
}

func (e *TMDBEnricher) enrichMovie(ctx context.Context, event *domain.Event, m *domain.FilmTVMetadata) error {
	url := fmt.Sprintf("%s/movie/%s?append_to_response=credits", e.baseURL, m.TMDBID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("building TMDB request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+e.readAccessToken)

	resp, err := e.client.Do(req)
	if err != nil {
		return fmt.Errorf("calling TMDB: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return fmt.Errorf("tmdb_id %q: %w", m.TMDBID, ErrNotFound)
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("TMDB returned status %d", resp.StatusCode)
	}

	var result tmdbMovieResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("decoding TMDB response: %w", err)
	}

	// Extract year from release_date.
	if len(result.ReleaseDate) >= 4 {
		var year int
		fmt.Sscanf(result.ReleaseDate[:4], "%d", &year)
		m.Year = year
	}

	// Find director in crew.
	for _, c := range result.Credits.Crew {
		if c.Job == "Director" {
			m.Director = c.Name
			break
		}
	}

	if err := e.uploadPoster(ctx, m, result.PosterPath); err != nil {
		return err
	}

	return domain.SetMetadata(event, m)
}

func (e *TMDBEnricher) enrichTV(ctx context.Context, event *domain.Event, m *domain.FilmTVMetadata) error {
	url := fmt.Sprintf("%s/tv/%s", e.baseURL, m.TMDBID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("building TMDB request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+e.readAccessToken)

	resp, err := e.client.Do(req)
	if err != nil {
		return fmt.Errorf("calling TMDB: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return fmt.Errorf("tmdb_id %q: %w", m.TMDBID, ErrNotFound)
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("TMDB returned status %d", resp.StatusCode)
	}

	var result tmdbTVResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("decoding TMDB response: %w", err)
	}

	if len(result.FirstAirDate) >= 4 {
		var year int
		fmt.Sscanf(result.FirstAirDate[:4], "%d", &year)
		m.Year = year
	}
	if len(result.Networks) > 0 {
		m.Network = result.Networks[0].Name
	}
	if result.NumberOfSeasons > 0 {
		m.SeasonsWatched = &result.NumberOfSeasons
	}

	if err := e.uploadPoster(ctx, m, result.PosterPath); err != nil {
		return err
	}

	return domain.SetMetadata(event, m)
}

func (e *TMDBEnricher) uploadPoster(ctx context.Context, m *domain.FilmTVMetadata, posterPath string) error {
	if posterPath == "" {
		return nil
	}
	imageURL := fmt.Sprintf("https://image.tmdb.org/t/p/original%s", posterPath)
	s3Key := fmt.Sprintf("timeline/film_tv/%s/poster.jpg", m.TMDBID)
	s3URL, err := e.uploader.UploadFromURL(ctx, imageURL, s3Key)
	if err != nil {
		return fmt.Errorf("uploading poster: %w", err)
	}
	m.PosterURL = s3URL
	return nil
}
