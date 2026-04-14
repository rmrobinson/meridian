package enrichment

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/s3"

	"github.com/rmrobinson/meridian/backend/internal/domain"
)

// --- mock S3 client ---

type mockS3 struct {
	err     error
	lastKey string
}

func (m *mockS3) PutObject(_ context.Context, params *s3.PutObjectInput, _ ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
	if params.Key != nil {
		m.lastKey = *params.Key
	}
	return &s3.PutObjectOutput{}, m.err
}

// newTestUploader wires an S3Uploader with a mock S3 client and the given
// HTTP client (typically pointed at an httptest.Server).
func newTestUploader(s3mock *mockS3, httpClient *http.Client) *S3Uploader {
	return newS3UploaderWithHTTP(s3mock, "test-bucket", "us-east-1", httpClient)
}

func strPtr(s string) *string { return &s }

// --- S3 tests ---

func TestS3UploadFromURL_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		w.Write([]byte("fake-image-data"))
	}))
	defer srv.Close()

	s3mock := &mockS3{}
	uploader := newTestUploader(s3mock, srv.Client())

	url, err := uploader.UploadFromURL(context.Background(), srv.URL+"/cover.jpg", "books/123/cover.jpg")
	if err != nil {
		t.Fatalf("UploadFromURL: %v", err)
	}
	if url == "" {
		t.Error("expected non-empty S3 URL")
	}
	if s3mock.lastKey != "books/123/cover.jpg" {
		t.Errorf("s3 key: got %q, want books/123/cover.jpg", s3mock.lastKey)
	}
}

func TestS3UploadFromURL_HTTPDownloadFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	s3mock := &mockS3{}
	uploader := newTestUploader(s3mock, srv.Client())

	_, err := uploader.UploadFromURL(context.Background(), srv.URL+"/missing.jpg", "key")
	if err == nil {
		t.Error("expected error for 404 response, got nil")
	}
}

func TestS3UploadFromURL_S3PutFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("data"))
	}))
	defer srv.Close()

	s3mock := &mockS3{err: errors.New("s3 unavailable")}
	uploader := newTestUploader(s3mock, srv.Client())

	_, err := uploader.UploadFromURL(context.Background(), srv.URL+"/img.jpg", "key")
	if err == nil {
		t.Error("expected error from S3 PutObject failure, got nil")
	}
}

// --- OpenLibrary tests ---

func newTestOpenLibraryEnricher(apiSrv, coverSrv *httptest.Server, uploader *S3Uploader) *OpenLibraryEnricher {
	return &OpenLibraryEnricher{
		uploader: uploader,
		baseURL:  apiSrv.URL,
		coverURL: coverSrv.URL,
		client:   apiSrv.Client(),
	}
}

func bookEvent(isbn string) *domain.Event {
	meta := fmt.Sprintf(`{"isbn":%q}`, isbn)
	return &domain.Event{FamilyID: "books", Metadata: &meta}
}

func TestOpenLibrary_ValidISBN_PopulatesAuthorAndTitle(t *testing.T) {
	const isbn = "9780441013593"

	coverSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("img"))
	}))
	defer coverSrv.Close()

	apiSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"ISBN:%s":{"title":"Dune","authors":[{"name":"Frank Herbert"}]}}`, isbn)
	}))
	defer apiSrv.Close()

	s3mock := &mockS3{}
	uploader := newTestUploader(s3mock, coverSrv.Client())
	enricher := newTestOpenLibraryEnricher(apiSrv, coverSrv, uploader)

	event := bookEvent(isbn)
	if err := enricher.Enrich(context.Background(), event); err != nil {
		t.Fatalf("Enrich: %v", err)
	}

	m, _ := domain.ParseMetadata[domain.BookMetadata](event)
	if m.Author != "Frank Herbert" {
		t.Errorf("author: got %q, want Frank Herbert", m.Author)
	}
	if m.Title != "Dune" {
		t.Errorf("title: got %q, want Dune", m.Title)
	}
}

func TestOpenLibrary_CoverUploadedToS3_URLReplaced(t *testing.T) {
	const isbn = "9780441013593"

	coverSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("img"))
	}))
	defer coverSrv.Close()

	apiSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"ISBN:%s":{"title":"Dune","authors":[{"name":"Frank Herbert"}]}}`, isbn)
	}))
	defer apiSrv.Close()

	s3mock := &mockS3{}
	uploader := newTestUploader(s3mock, coverSrv.Client())
	enricher := newTestOpenLibraryEnricher(apiSrv, coverSrv, uploader)

	event := bookEvent(isbn)
	if err := enricher.Enrich(context.Background(), event); err != nil {
		t.Fatalf("Enrich: %v", err)
	}

	m, _ := domain.ParseMetadata[domain.BookMetadata](event)
	if m.CoverImageURL == "" {
		t.Error("cover_image_url should not be empty after upload")
	}
	if s3mock.lastKey != "timeline/books/"+isbn+"/cover.jpg" {
		t.Errorf("s3 key: got %q, want timeline/books/%s/cover.jpg", s3mock.lastKey, isbn)
	}
}

func TestOpenLibrary_APIError_ReturnsError(t *testing.T) {
	coverSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer coverSrv.Close()

	apiSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer apiSrv.Close()

	enricher := newTestOpenLibraryEnricher(apiSrv, coverSrv, newTestUploader(&mockS3{}, apiSrv.Client()))
	err := enricher.Enrich(context.Background(), bookEvent("9780441013593"))
	if err == nil {
		t.Error("expected error for 500 response, got nil")
	}
}

func TestOpenLibrary_UnknownISBN_ReturnsNotFound(t *testing.T) {
	coverSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer coverSrv.Close()

	// OpenLibrary returns HTTP 200 with an empty object when the ISBN is unknown.
	apiSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{}`))
	}))
	defer apiSrv.Close()

	enricher := newTestOpenLibraryEnricher(apiSrv, coverSrv, newTestUploader(&mockS3{}, apiSrv.Client()))
	err := enricher.Enrich(context.Background(), bookEvent("0000000000"))
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestOpenLibrary_S3UploadFailure_ReturnsError(t *testing.T) {
	const isbn = "9780441013593"

	coverSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("img"))
	}))
	defer coverSrv.Close()

	apiSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"ISBN:%s":{"title":"Dune","authors":[{"name":"Frank Herbert"}]}}`, isbn)
	}))
	defer apiSrv.Close()

	s3mock := &mockS3{err: errors.New("s3 down")}
	uploader := newTestUploader(s3mock, coverSrv.Client())
	enricher := newTestOpenLibraryEnricher(apiSrv, coverSrv, uploader)

	err := enricher.Enrich(context.Background(), bookEvent(isbn))
	if err == nil {
		t.Error("expected error when S3 upload fails, got nil")
	}
}

// --- TMDB tests ---

func newTestTMDBEnricher(apiSrv *httptest.Server, uploader *S3Uploader) *TMDBEnricher {
	return &TMDBEnricher{
		readAccessToken: "test-token",
		uploader:        uploader,
		baseURL:         apiSrv.URL,
		client:          apiSrv.Client(),
	}
}

func filmEvent(tmdbID, mediaType string) *domain.Event {
	meta := fmt.Sprintf(`{"tmdb_id":%q,"type":%q}`, tmdbID, mediaType)
	return &domain.Event{FamilyID: "film_tv", Metadata: &meta}
}

func TestTMDB_Movie_PopulatesDirectorAndYear(t *testing.T) {
	imgSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("img"))
	}))
	defer imgSrv.Close()

	apiSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"title":"The Godfather","release_date":"1972-03-24","poster_path":"","credits":{"crew":[{"job":"Director","name":"Francis Ford Coppola"}]}}`))
	}))
	defer apiSrv.Close()

	enricher := newTestTMDBEnricher(apiSrv, newTestUploader(&mockS3{}, imgSrv.Client()))
	event := filmEvent("238", "movie")
	if err := enricher.Enrich(context.Background(), event); err != nil {
		t.Fatalf("Enrich: %v", err)
	}

	m, _ := domain.ParseMetadata[domain.FilmTVMetadata](event)
	if m.Director != "Francis Ford Coppola" {
		t.Errorf("director: got %q, want Francis Ford Coppola", m.Director)
	}
	if m.Year != 1972 {
		t.Errorf("year: got %d, want 1972", m.Year)
	}
}

func TestTMDB_TV_PopulatesNetworkAndSeasons(t *testing.T) {
	imgSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("img"))
	}))
	defer imgSrv.Close()

	apiSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"name":"Breaking Bad","first_air_date":"2008-01-20","poster_path":"","networks":[{"name":"AMC"}],"number_of_seasons":5}`))
	}))
	defer apiSrv.Close()

	enricher := newTestTMDBEnricher(apiSrv, newTestUploader(&mockS3{}, imgSrv.Client()))
	event := filmEvent("1396", "tv")
	if err := enricher.Enrich(context.Background(), event); err != nil {
		t.Fatalf("Enrich: %v", err)
	}

	m, _ := domain.ParseMetadata[domain.FilmTVMetadata](event)
	if m.Network != "AMC" {
		t.Errorf("network: got %q, want AMC", m.Network)
	}
	if m.SeasonsWatched == nil || *m.SeasonsWatched != 5 {
		t.Errorf("seasons_watched: got %v, want 5", m.SeasonsWatched)
	}
}

func TestTMDB_PosterUploadedToS3_URLReplaced(t *testing.T) {
	imgSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("img"))
	}))
	defer imgSrv.Close()

	apiSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"title":"Dune","release_date":"2021-09-15","poster_path":"/poster.jpg","credits":{"crew":[]}}`))
	}))
	defer apiSrv.Close()

	// The uploader needs to reach the image server, but the TMDB enricher
	// builds the image URL from image.tmdb.org — override by using a custom
	// uploader that can reach our test image server.
	s3mock := &mockS3{}
	// We need the uploader's httpClient to reach imgSrv, but UploadFromURL is
	// called with the full image URL. We'll use a transport that redirects
	// tmdb image requests to imgSrv.
	transport := &redirectTransport{target: imgSrv.URL, inner: imgSrv.Client().Transport}
	uploader := newS3UploaderWithHTTP(s3mock, "test-bucket", "us-east-1", &http.Client{Transport: transport})
	enricher := newTestTMDBEnricher(apiSrv, uploader)

	event := filmEvent("438631", "movie")
	if err := enricher.Enrich(context.Background(), event); err != nil {
		t.Fatalf("Enrich: %v", err)
	}

	m, _ := domain.ParseMetadata[domain.FilmTVMetadata](event)
	if m.PosterURL == "" {
		t.Error("poster_url should not be empty after S3 upload")
	}
	if s3mock.lastKey == "" {
		t.Error("expected S3 PutObject to be called")
	}
}

func TestTMDB_APIError_ReturnsError(t *testing.T) {
	apiSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer apiSrv.Close()

	enricher := newTestTMDBEnricher(apiSrv, newTestUploader(&mockS3{}, apiSrv.Client()))
	err := enricher.Enrich(context.Background(), filmEvent("238", "movie"))
	if err == nil {
		t.Error("expected error for 500 response, got nil")
	}
}

func TestTMDB_UnknownID_ReturnsNotFound(t *testing.T) {
	apiSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer apiSrv.Close()

	enricher := newTestTMDBEnricher(apiSrv, newTestUploader(&mockS3{}, apiSrv.Client()))
	err := enricher.Enrich(context.Background(), filmEvent("999999", "movie"))
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

// redirectTransport rewrites all requests to go to the target server,
// used to intercept tmdb image.org URLs in tests.
type redirectTransport struct {
	target string
	inner  http.RoundTripper
}

func (t *redirectTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	req2 := req.Clone(req.Context())
	req2.URL.Scheme = "http"
	req2.URL.Host = req.URL.Host
	// Re-point to target host
	targetURL := t.target
	req2.URL.Host = targetURL[len("http://"):]
	req2.Host = req2.URL.Host
	if t.inner != nil {
		return t.inner.RoundTrip(req2)
	}
	return http.DefaultTransport.RoundTrip(req2)
}
