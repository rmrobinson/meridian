package enrichment

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// S3PutObjectAPI is the subset of the S3 client needed for uploads.
// Using an interface allows test code to inject a mock.
type S3PutObjectAPI interface {
	PutObject(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.Options)) (*s3.PutObjectOutput, error)
}

// S3Uploader downloads a file from a URL and uploads it to S3.
type S3Uploader struct {
	client     S3PutObjectAPI
	bucket     string
	region     string
	httpClient *http.Client
}

// NewS3Uploader creates an S3Uploader backed by the given client.
func NewS3Uploader(client S3PutObjectAPI, bucket, region string) *S3Uploader {
	return &S3Uploader{
		client:     client,
		bucket:     bucket,
		region:     region,
		httpClient: &http.Client{},
	}
}

// newS3UploaderWithHTTP is used in tests to inject a custom HTTP client
// (e.g. one pointed at an httptest.Server).
func newS3UploaderWithHTTP(client S3PutObjectAPI, bucket, region string, httpClient *http.Client) *S3Uploader {
	return &S3Uploader{
		client:     client,
		bucket:     bucket,
		region:     region,
		httpClient: httpClient,
	}
}

// UploadFromURL downloads the file at sourceURL and stores it at s3Key in the
// configured bucket. Returns the public S3 URL on success.
func (u *S3Uploader) UploadFromURL(ctx context.Context, sourceURL, s3Key string) (string, error) {
	resp, err := u.httpClient.Get(sourceURL)
	if err != nil {
		return "", fmt.Errorf("downloading %s: %w", sourceURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("downloading %s: unexpected status %d", sourceURL, resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("reading response body: %w", err)
	}

	_, err = u.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(u.bucket),
		Key:         aws.String(s3Key),
		Body:        bytes.NewReader(body),
		ContentType: aws.String(resp.Header.Get("Content-Type")),
	})
	if err != nil {
		return "", fmt.Errorf("uploading to S3: %w", err)
	}

	return fmt.Sprintf("https://%s.s3.%s.amazonaws.com/%s", u.bucket, u.region, s3Key), nil
}
