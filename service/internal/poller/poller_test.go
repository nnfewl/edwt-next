package poller

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"

	"github.com/nnfewl/edwt-next/service/internal/edwt"
	"github.com/nnfewl/edwt-next/service/internal/obs"
	"github.com/nnfewl/edwt-next/service/internal/store"
)

type fakeArchiver struct {
	puts    int
	lastKey string
	lastLen int
}

func (f *fakeArchiver) Put(_ context.Context, key string, body []byte) error {
	f.puts++
	f.lastKey = key
	f.lastLen = len(body)
	return nil
}

type fakeDB struct {
	calls     int
	lastItems int
}

func (f *fakeDB) Write(_ context.Context, items []edwt.Location, _ time.Time) (store.WriteResult, error) {
	f.calls++
	f.lastItems = len(items)
	n := 0
	for _, it := range items {
		if it.WaitTime != nil && it.WaitTime.ReportID != "" {
			n++
		}
	}
	return store.WriteResult{Locations: len(items), NewReadings: n}, nil
}

const feed = `[{"id":"a","name":"A","waitTime":{"reportId":"r1","waitTimeMinutes":5}},{"id":"b","name":"B"}]`

func discardLogger() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func TestRunOnce(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(feed))
	}))
	defer srv.Close()

	m := obs.NewMetrics(prometheus.NewRegistry())
	st := obs.NewStatus()
	fa := &fakeArchiver{}
	fd := &fakeDB{}
	p := New(srv.URL, srv.Client(), fa, fd, m, st, discardLogger())

	out, err := p.RunOnce(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if fa.puts != 1 {
		t.Fatalf("archive puts = %d, want 1", fa.puts)
	}
	if !strings.HasPrefix(fa.lastKey, "raw/") {
		t.Fatalf("bad archive key %q", fa.lastKey)
	}
	if fa.lastLen == 0 {
		t.Fatal("archived an empty body")
	}
	if fd.calls != 1 || fd.lastItems != 2 {
		t.Fatalf("db calls=%d items=%d, want 1/2", fd.calls, fd.lastItems)
	}
	if out.Locations != 2 || out.NewReadings != 1 {
		t.Fatalf("outcome=%+v, want Locations=2 NewReadings=1", out)
	}
	if !out.Archived {
		t.Fatal("expected Archived=true")
	}
}

func TestRunOnceArchiveOnly(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(feed))
	}))
	defer srv.Close()

	m := obs.NewMetrics(prometheus.NewRegistry())
	fa := &fakeArchiver{}
	p := New(srv.URL, srv.Client(), fa, nil, m, obs.NewStatus(), discardLogger())

	out, err := p.RunOnce(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if fa.puts != 1 {
		t.Fatalf("archive puts = %d, want 1", fa.puts)
	}
	if out.Locations != 0 {
		t.Fatalf("archive-only mode should not report DB rows, got %+v", out)
	}
}
