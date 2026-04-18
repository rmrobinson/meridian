package enrichment

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/rmrobinson/meridian/backend/internal/domain"
	"go.uber.org/zap"
)

// ErrNotFound is returned when the external API cannot find the requested resource.
var ErrNotFound = errors.New("not found")

// OpenLibraryEnricher fetches book metadata from the OpenLibrary API and uploads
// the cover image to S3. No API key is required.
type OpenLibraryEnricher struct {
	logger   *zap.Logger
	uploader *S3Uploader
	baseURL  string // overridable for tests; default: https://openlibrary.org
	coverURL string // overridable for tests; default: https://covers.openlibrary.org
	client   *http.Client
}

// NewOpenLibraryEnricher creates an OpenLibraryEnricher.
func NewOpenLibraryEnricher(logger *zap.Logger, uploader *S3Uploader) *OpenLibraryEnricher {
	return &OpenLibraryEnricher{
		logger:   logger,
		uploader: uploader,
		baseURL:  "https://openlibrary.org",
		coverURL: "https://covers.openlibrary.org",
		client:   &http.Client{},
	}
}

type openLibraryAuthor struct {
	Name string `json:"name"`
}

// openLibraryDetails holds the book detail fields returned under the "details" key
// when using jscmd=details. Description may be a plain string or an object with a
// "value" field — both are captured as raw JSON and parsed in parseDescription.
type openLibraryDetails struct {
	Title       string              `json:"title"`
	Authors     []openLibraryAuthor `json:"authors"`
	Description json.RawMessage     `json:"description"`
}

type openLibraryResult struct {
	Details openLibraryDetails `json:"details"`
}

// parseDescription handles both string and {"type":…,"value":…} forms.
func parseDescription(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	// Try plain string first.
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s
	}
	// Try object with "value" field.
	var obj struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(raw, &obj); err == nil {
		return obj.Value
	}
	return ""
}

// Enrich fetches metadata for the book identified by metadata.isbn and
// populates title, author, description, and cover_image_url.
func (e *OpenLibraryEnricher) Enrich(ctx context.Context, event *domain.Event) error {
	m, err := domain.ParseMetadata[domain.BookMetadata](event)
	if err != nil {
		return fmt.Errorf("parsing book metadata: %w", err)
	}
	if m.ISBN == "" {
		return fmt.Errorf("book event missing isbn in metadata")
	}

	isbn := strings.ReplaceAll(m.ISBN, "-", "")
	url := fmt.Sprintf("%s/api/books?bibkeys=ISBN:%s&format=json&jscmd=details", e.baseURL, isbn)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("building OpenLibrary request: %w", err)
	}
	req.Header.Set("User-Agent", "meridian/1.0")

	resp, err := e.client.Do(req)
	if err != nil {
		return fmt.Errorf("calling OpenLibrary: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return fmt.Errorf("isbn %q: %w", m.ISBN, ErrNotFound)
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("OpenLibrary returned status %d", resp.StatusCode)
	}

	var result map[string]openLibraryResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("decoding OpenLibrary response: %w", err)
	}

	book, ok := result[fmt.Sprintf("ISBN:%s", isbn)]
	if !ok {
		return fmt.Errorf("isbn %q: %w", m.ISBN, ErrNotFound)
	}

	details := book.Details
	if details.Title != "" {
		m.Title = details.Title
		if event.Title == "" {
			event.Title = details.Title
		}
	}
	if len(details.Authors) > 0 {
		m.Author = details.Authors[0].Name
	}
	if desc := parseDescription(details.Description); desc != "" {
		event.Description = &desc
	}

	// Upload cover image to S3 using the ISBN-based cover URL.
	imgURL := fmt.Sprintf("%s/b/isbn/%s-L.jpg", e.coverURL, isbn)
	s3Key := fmt.Sprintf("timeline/books/%s/cover.jpg", isbn)
	s3URL, err := e.uploader.UploadFromURLIfNotExists(ctx, imgURL, s3Key)
	if err != nil {
		e.logger.Warn("cover image unavailable; skipping",
			zap.String("isbn", isbn),
			zap.String("cover_url", imgURL),
			zap.Error(err),
		)
	} else {
		m.CoverImageURL = s3URL
	}

	return domain.SetMetadata(event, m)
}
