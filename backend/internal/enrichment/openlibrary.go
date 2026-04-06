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

// OpenLibraryEnricher fetches book metadata from the OpenLibrary API and uploads
// the cover image to S3. No API key is required.
type OpenLibraryEnricher struct {
	uploader *S3Uploader
	baseURL  string // overridable for tests; default: https://openlibrary.org
	coverURL string // overridable for tests; default: https://covers.openlibrary.org
	client   *http.Client
}

// NewOpenLibraryEnricher creates an OpenLibraryEnricher.
func NewOpenLibraryEnricher(uploader *S3Uploader) *OpenLibraryEnricher {
	return &OpenLibraryEnricher{
		uploader: uploader,
		baseURL:  "https://openlibrary.org",
		coverURL: "https://covers.openlibrary.org",
		client:   &http.Client{},
	}
}

type openLibraryAuthor struct {
	Name string `json:"name"`
}

type openLibraryBook struct {
	Title   string              `json:"title"`
	Authors []openLibraryAuthor `json:"authors"`
}

// Enrich fetches metadata for the book identified by metadata.isbn and
// populates title, author, and cover_image_url.
func (e *OpenLibraryEnricher) Enrich(ctx context.Context, event *domain.Event) error {
	m, err := domain.ParseMetadata[domain.BookMetadata](event)
	if err != nil {
		return fmt.Errorf("parsing book metadata: %w", err)
	}
	if m.ISBN == "" {
		return fmt.Errorf("book event missing isbn in metadata")
	}

	url := fmt.Sprintf("%s/api/books?bibkeys=ISBN:%s&format=json&jscmd=data", e.baseURL, m.ISBN)
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

	var result map[string]openLibraryBook
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("decoding OpenLibrary response: %w", err)
	}

	book, ok := result[fmt.Sprintf("ISBN:%s", m.ISBN)]
	if !ok {
		return fmt.Errorf("isbn %q: %w", m.ISBN, ErrNotFound)
	}

	if book.Title != "" {
		m.Title = book.Title
	}
	if len(book.Authors) > 0 {
		m.Author = book.Authors[0].Name
	}

	// Upload cover image to S3 using the ISBN-based cover URL.
	imgURL := fmt.Sprintf("%s/b/isbn/%s-L.jpg", e.coverURL, m.ISBN)
	s3Key := fmt.Sprintf("timeline/books/%s/cover.jpg", m.ISBN)
	s3URL, err := e.uploader.UploadFromURL(ctx, imgURL, s3Key)
	if err != nil {
		return fmt.Errorf("uploading cover image: %w", err)
	}
	m.CoverImageURL = s3URL

	return domain.SetMetadata(event, m)
}
