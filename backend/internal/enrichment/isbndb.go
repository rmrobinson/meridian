package enrichment

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/rmrobinson/meridian/backend/internal/domain"
)

// ErrNotFound is returned when the external API cannot find the requested resource.
var ErrNotFound = errors.New("not found")

// ISBNdbEnricher fetches book metadata from the ISBNdb API and uploads the
// cover image to S3.
type ISBNdbEnricher struct {
	apiKey   string
	uploader *S3Uploader
	baseURL  string // overridable for tests
	client   *http.Client
}

// NewISBNdbEnricher creates an ISBNdbEnricher.
func NewISBNdbEnricher(apiKey string, uploader *S3Uploader) *ISBNdbEnricher {
	return &ISBNdbEnricher{
		apiKey:   apiKey,
		uploader: uploader,
		baseURL:  "https://api2.isbndb.com",
		client:   &http.Client{},
	}
}

type isbndbBookResponse struct {
	Book struct {
		Title    string `json:"title"`
		Authors  []string `json:"authors"`
		Image    string `json:"image"`
		Synopsis string `json:"synopsis"`
	} `json:"book"`
}

// Enrich fetches metadata for the book identified by metadata.isbn and
// populates author, cover_image_url, and preview_url.
func (e *ISBNdbEnricher) Enrich(ctx context.Context, event *domain.Event) error {
	m, err := domain.ParseMetadata[domain.BookMetadata](event)
	if err != nil {
		return fmt.Errorf("parsing book metadata: %w", err)
	}
	if m.ISBN == "" {
		return fmt.Errorf("book event missing isbn in metadata")
	}

	url := fmt.Sprintf("%s/book/%s", e.baseURL, m.ISBN)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("building ISBNdb request: %w", err)
	}
	req.Header.Set("Authorization", e.apiKey)

	resp, err := e.client.Do(req)
	if err != nil {
		return fmt.Errorf("calling ISBNdb: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return fmt.Errorf("isbn %q: %w", m.ISBN, ErrNotFound)
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("ISBNdb returned status %d", resp.StatusCode)
	}

	var result isbndbBookResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("decoding ISBNdb response: %w", err)
	}

	if len(result.Book.Authors) > 0 {
		m.Author = result.Book.Authors[0]
	}
	if result.Book.Synopsis != "" {
		m.PreviewURL = result.Book.Synopsis
	}

	// Upload cover image to S3 and replace URL.
	if result.Book.Image != "" {
		s3Key := fmt.Sprintf("timeline/books/%s/cover.jpg", m.ISBN)
		s3URL, err := e.uploader.UploadFromURL(ctx, result.Book.Image, s3Key)
		if err != nil {
			return fmt.Errorf("uploading cover image: %w", err)
		}
		m.CoverImageURL = s3URL
	}

	return domain.SetMetadata(event, m)
}
