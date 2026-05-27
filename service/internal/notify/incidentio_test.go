package notify

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestIncidentIOSend(t *testing.T) {
	var gotPath, gotAuth, gotCT string
	var got AlertEvent
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		gotCT = r.Header.Get("Content-Type")
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &got)
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()

	c := NewIncidentIO(srv.URL+"/v2/alert_events/http/SRC123", "tok-abc")
	err := c.Send(context.Background(), AlertEvent{
		DeduplicationKey: "edwt-archive",
		Status:           "firing",
		Title:            "edwt collector: archive",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(gotPath, "/SRC123") {
		t.Fatalf("path = %q", gotPath)
	}
	if gotAuth != "Bearer tok-abc" {
		t.Fatalf("auth = %q", gotAuth)
	}
	if gotCT != "application/json" {
		t.Fatalf("content-type = %q", gotCT)
	}
	if got.DeduplicationKey != "edwt-archive" || got.Status != "firing" {
		t.Fatalf("body = %+v", got)
	}
}

func TestIncidentIOSendError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"error":"bad"}`, http.StatusBadRequest)
	}))
	defer srv.Close()

	c := NewIncidentIO(srv.URL+"/v2/alert_events/http/X", "t")
	if err := c.Send(context.Background(), AlertEvent{Status: "firing"}); err == nil {
		t.Fatal("expected error on non-2xx response")
	}
}
