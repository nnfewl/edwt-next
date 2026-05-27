package notify

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/nnfewl/edwt-next/service/internal/obs"
)

type fakeSender struct{ events []AlertEvent }

func (f *fakeSender) Send(_ context.Context, ev AlertEvent) error {
	f.events = append(f.events, ev)
	return nil
}

type fakeEval struct{ comps []obs.Component }

func (f *fakeEval) Evaluate(_ context.Context) []obs.Component { return f.comps }

func discard() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func TestReconcilerTransitions(t *testing.T) {
	ctx := context.Background()
	fs := &fakeSender{}
	fe := &fakeEval{comps: []obs.Component{
		{Name: "archive", Healthy: false, Detail: "R2"},
		{Name: "database", Healthy: true, Detail: "db"},
	}}
	r := NewReconciler(fe, fs, time.Minute, discard())

	// Tick 1: archive unhealthy (first-seen) -> firing; database healthy -> no send.
	r.tick(ctx)
	if len(fs.events) != 1 {
		t.Fatalf("after tick 1: want 1 event, got %d (%+v)", len(fs.events), fs.events)
	}
	if fs.events[0].Status != "firing" || fs.events[0].DeduplicationKey != "edwt-archive" {
		t.Fatalf("unexpected first event: %+v", fs.events[0])
	}

	// Tick 2: nothing changed -> no new event.
	r.tick(ctx)
	if len(fs.events) != 1 {
		t.Fatalf("after tick 2 (no change): want 1 event, got %d", len(fs.events))
	}

	// archive recovers -> resolved.
	fe.comps[0].Healthy = true
	r.tick(ctx)
	if len(fs.events) != 2 {
		t.Fatalf("after recovery: want 2 events, got %d", len(fs.events))
	}
	if fs.events[1].Status != "resolved" || fs.events[1].DeduplicationKey != "edwt-archive" {
		t.Fatalf("unexpected resolve event: %+v", fs.events[1])
	}
}

func TestReconcilerHealthyStartIsQuiet(t *testing.T) {
	fs := &fakeSender{}
	fe := &fakeEval{comps: []obs.Component{{Name: "archive", Healthy: true}}}
	r := NewReconciler(fe, fs, time.Minute, discard())
	r.tick(context.Background())
	if len(fs.events) != 0 {
		t.Fatalf("healthy-from-start should not alert, got %d", len(fs.events))
	}
}
