// Package notify pushes component health to incident.io via its HTTP alert source.
package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// AlertEvent is one incident.io alert-source event. Events sharing a
// DeduplicationKey are the same alert; a "resolved" event closes the firing one.
type AlertEvent struct {
	DeduplicationKey string         `json:"deduplication_key"`
	Status           string         `json:"status"` // "firing" | "resolved"
	Title            string         `json:"title"`
	Description      string         `json:"description,omitempty"`
	Metadata         map[string]any `json:"metadata,omitempty"`
	SourceURL        string         `json:"source_url,omitempty"`
}

// Sender delivers an AlertEvent. Implemented by IncidentIO; faked in tests.
type Sender interface {
	Send(ctx context.Context, ev AlertEvent) error
}

// IncidentIO posts alert events to an incident.io HTTP alert source.
type IncidentIO struct {
	url    string
	token  string
	client *http.Client
}

// NewIncidentIO builds a client for the given alert-source URL + bearer token.
func NewIncidentIO(url, token string) *IncidentIO {
	return &IncidentIO{url: url, token: token, client: &http.Client{Timeout: 10 * time.Second}}
}

// Send POSTs one alert event.
func (c *IncidentIO) Send(ctx context.Context, ev AlertEvent) error {
	body, err := json.Marshal(ev)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Content-Type", "application/json")

	res, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode/100 != 2 {
		msg, _ := io.ReadAll(io.LimitReader(res.Body, 2048))
		return fmt.Errorf("incident.io HTTP %d: %s", res.StatusCode, msg)
	}
	return nil
}
