// Package archive writes raw feed payloads to Cloudflare R2 (S3-compatible).
package archive

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	smithyhttp "github.com/aws/smithy-go/transport/http"

	"github.com/nnfewl/edwt-next/service/internal/config"
)

// Archiver uploads gzipped raw payloads to an R2 bucket.
type Archiver struct {
	client *s3.Client
	bucket string
}

// New builds an Archiver from R2 config. R2 speaks the S3 API, so this is the
// standard aws-sdk-go-v2 S3 client pointed at the account endpoint.
func New(ctx context.Context, cfg config.R2Config) (*Archiver, error) {
	awscfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion("auto"),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(cfg.AccessKeyID, cfg.SecretAccessKey, ""),
		),
		// R2 doesn't accept the SDK's default trailing checksums on every op.
		awsconfig.WithRequestChecksumCalculation(aws.RequestChecksumCalculationWhenRequired),
	)
	if err != nil {
		return nil, err
	}
	client := s3.NewFromConfig(awscfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(cfg.Endpoint())
	})
	return &Archiver{client: client, bucket: cfg.Bucket}, nil
}

// Key builds a content-addressed object key. It is deterministic per minute +
// payload, so identical polls (including from a second archiver) map to the
// same key and never duplicate. Distinct payloads in the same minute differ by
// hash suffix.
func Key(t time.Time, body []byte) string {
	sum := sha256.Sum256(body)
	h := hex.EncodeToString(sum[:])[:12]
	return "raw/" + t.UTC().Format("2006/01/02/15/04-") + h + ".json.gz"
}

// Put gzips and uploads body under key. It uses If-None-Match: * so a key that
// already exists (an identical earlier poll) is a no-op rather than a rewrite.
func (a *Archiver) Put(ctx context.Context, key string, body []byte) error {
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	if _, err := gz.Write(body); err != nil {
		return err
	}
	if err := gz.Close(); err != nil {
		return err
	}
	_, err := a.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:          aws.String(a.bucket),
		Key:             aws.String(key),
		Body:            bytes.NewReader(buf.Bytes()),
		ContentType:     aws.String("application/json"),
		ContentEncoding: aws.String("gzip"),
		IfNoneMatch:     aws.String("*"),
	})
	// 412 == object already exists; treat as idempotent success.
	var re *smithyhttp.ResponseError
	if errors.As(err, &re) && re.HTTPStatusCode() == 412 {
		return nil
	}
	return err
}
