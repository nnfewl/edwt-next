// Package edwt fetches and decodes the edwaittimes.ca wait-times feed.
package edwt

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// WaitTime is the per-facility wait-time report embedded in a Location.
type WaitTime struct {
	ID              string  `json:"id"`
	CreatedAt       string  `json:"createdAt"`
	ReportID        string  `json:"reportId"`
	WaitTimeMinutes *int    `json:"waitTimeMinutes"`
	ElosMinutes     *int    `json:"elosMinutes"`
	Status          *string `json:"status"`
}

// Location is a facility plus its current wait-time report. Only the fields we
// persist are typed; the complete raw item is preserved in Raw for the metadata
// column and the R2 archive. Unknown fields are ignored by encoding/json.
type Location struct {
	ID               string          `json:"id"`
	Name             string          `json:"name"`
	Slug             *string         `json:"slug"`
	Type             *string         `json:"type"`
	Status           *string         `json:"status"`
	Address          *string         `json:"address"`
	Website          *string         `json:"website"`
	Phone            *string         `json:"phone"`
	Description      *string         `json:"description"`
	Audience         *string         `json:"audience"`
	Latitude         *float64        `json:"latitude"`
	Longitude        *float64        `json:"longitude"`
	Open247          *bool           `json:"open247"`
	ShowWaitTimes    *bool           `json:"showWaitTimes"`
	ShowStatus       *bool           `json:"showStatus"`
	WaitTimeFallback *string         `json:"waitTimeFallback"`
	AlertShow        *bool           `json:"alertShow"`
	AlertTitle       *string         `json:"alertTitle"`
	AlertDescription *string         `json:"alertDescription"`
	OperatingHours   json.RawMessage `json:"operatingHours"`
	WaitTime         *WaitTime       `json:"waitTime"`

	Raw json.RawMessage `json:"-"` // the verbatim item, filled by Decode
}

// FetchResult is the outcome of one HTTP GET against the feed.
type FetchResult struct {
	Status     int
	Body       []byte
	DurationMs int64
}

// Fetch does a full GET of the feed (stateless — no ETag, matching the Edge
// Function). It returns an error on any non-200 response.
func Fetch(ctx context.Context, client *http.Client, url string) (FetchResult, error) {
	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return FetchResult{}, err
	}
	req.Header.Set("Accept", "application/json")
	res, err := client.Do(req)
	if err != nil {
		return FetchResult{}, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	dur := time.Since(start).Milliseconds()
	if err != nil {
		return FetchResult{}, err
	}
	if res.StatusCode != http.StatusOK {
		return FetchResult{Status: res.StatusCode, DurationMs: dur}, fmt.Errorf("source returned HTTP %d", res.StatusCode)
	}
	return FetchResult{Status: res.StatusCode, Body: body, DurationMs: dur}, nil
}

// Decode parses the feed body into typed Locations, leniently: items that fail
// to parse or lack an id are skipped rather than failing the whole batch. Each
// returned Location keeps its verbatim JSON in Raw.
func Decode(body []byte) ([]Location, error) {
	var raw []json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("feed is not a JSON array: %w", err)
	}
	items := make([]Location, 0, len(raw))
	for _, r := range raw {
		var loc Location
		if err := json.Unmarshal(r, &loc); err != nil {
			continue
		}
		if loc.ID == "" {
			continue
		}
		loc.Raw = r
		items = append(items, loc)
	}
	return items, nil
}
