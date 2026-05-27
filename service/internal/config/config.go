// Package config loads the worker's runtime configuration from the environment.
package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config is the fully-resolved worker configuration.
type Config struct {
	SourceURL         string        // upstream feed
	PollInterval      time.Duration // between polls
	DatabaseURL       string        // Supabase (or local) Postgres DSN
	WriteDB           bool          // second-writer DB path (default true)
	HTTPAddr          string        // metrics/health/api listen addr
	ReadyMaxStaleness time.Duration // /readyz fails if last archive older than this
	R2                R2Config
	IncidentIO        IncidentIOConfig
}

// IncidentIOConfig drives the incident.io HTTP alert-source integration.
type IncidentIOConfig struct {
	AlertSourceID     string        // the {config_id} in the alert-source URL
	Token             string        // alert-source bearer token
	ReconcileInterval time.Duration // how often to evaluate + push transitions
}

// Enabled reports whether the incident.io push is configured.
func (c IncidentIOConfig) Enabled() bool {
	return c.AlertSourceID != "" && c.Token != ""
}

// URL is the alert-events endpoint for the configured source.
func (c IncidentIOConfig) URL() string {
	return "https://api.incident.io/v2/alert_events/http/" + c.AlertSourceID
}

// R2Config holds Cloudflare R2 (S3-compatible) credentials and target bucket.
type R2Config struct {
	AccountID       string
	AccessKeyID     string
	SecretAccessKey string
	Bucket          string
}

// Enabled reports whether enough R2 settings are present to archive.
func (r R2Config) Enabled() bool {
	return r.AccountID != "" && r.Bucket != "" && r.AccessKeyID != "" && r.SecretAccessKey != ""
}

// Endpoint is the R2 S3 API endpoint for the account.
func (r R2Config) Endpoint() string {
	return "https://" + r.AccountID + ".r2.cloudflarestorage.com"
}

// Load reads configuration from the environment, applying defaults.
func Load() (Config, error) {
	c := Config{
		SourceURL:         envOr("EDWT_SOURCE_URL", "https://www.edwaittimes.ca/api/wait-times"),
		DatabaseURL:       os.Getenv("DATABASE_URL"),
		WriteDB:           envBool("EDWT_WRITE_DB", true),
		HTTPAddr:          envOr("EDWT_HTTP_ADDR", ":8080"),
		ReadyMaxStaleness: envDuration("EDWT_READY_MAX_STALENESS", 3*time.Minute),
		R2: R2Config{
			AccountID:       os.Getenv("R2_ACCOUNT_ID"),
			AccessKeyID:     os.Getenv("R2_ACCESS_KEY_ID"),
			SecretAccessKey: os.Getenv("R2_SECRET_ACCESS_KEY"),
			Bucket:          os.Getenv("R2_BUCKET"),
		},
		IncidentIO: IncidentIOConfig{
			AlertSourceID:     os.Getenv("INCIDENTIO_ALERT_SOURCE_ID"),
			Token:             os.Getenv("INCIDENTIO_ALERT_TOKEN"),
			ReconcileInterval: envDuration("INCIDENTIO_RECONCILE_INTERVAL", 60*time.Second),
		},
	}

	ms := envInt("POLL_INTERVAL_MS", 60000)
	if ms < 1000 {
		return Config{}, fmt.Errorf("POLL_INTERVAL_MS must be >= 1000, got %d", ms)
	}
	c.PollInterval = time.Duration(ms) * time.Millisecond

	if c.WriteDB && c.DatabaseURL == "" {
		return Config{}, fmt.Errorf("EDWT_WRITE_DB is true but DATABASE_URL is empty")
	}
	return c, nil
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envInt(k string, def int) int {
	if v := os.Getenv(k); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func envBool(k string, def bool) bool {
	if v := os.Getenv(k); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return def
}

func envDuration(k string, def time.Duration) time.Duration {
	if v := os.Getenv(k); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}
