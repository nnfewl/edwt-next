package archive

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
)

type recordingPutter struct {
	calls int
	err   error
}

func (r *recordingPutter) Put(_ context.Context, _ string, _ []byte) error {
	r.calls++
	return r.err
}

func discardLog() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func TestCompositePrimaryErrorPropagates(t *testing.T) {
	primary := &recordingPutter{err: errors.New("disk full")}
	secondary := &recordingPutter{}
	c := NewComposite(primary, secondary, discardLog())

	if err := c.Put(context.Background(), "k", []byte("v")); err == nil {
		t.Fatal("expected primary error, got nil")
	}
	if secondary.calls != 0 {
		t.Fatalf("secondary should be skipped when primary fails, calls=%d", secondary.calls)
	}
}

func TestCompositeSecondaryErrorIsBestEffort(t *testing.T) {
	primary := &recordingPutter{}
	secondary := &recordingPutter{err: errors.New("r2 down")}
	c := NewComposite(primary, secondary, discardLog())

	if err := c.Put(context.Background(), "k", []byte("v")); err != nil {
		t.Fatalf("secondary error should be swallowed, got %v", err)
	}
	if primary.calls != 1 {
		t.Fatalf("primary calls = %d, want 1", primary.calls)
	}
	if secondary.calls != 1 {
		t.Fatalf("secondary calls = %d, want 1", secondary.calls)
	}
}

func TestCompositeNoSecondary(t *testing.T) {
	primary := &recordingPutter{}
	c := NewComposite(primary, nil, discardLog())

	if err := c.Put(context.Background(), "k", []byte("v")); err != nil {
		t.Fatalf("Put: %v", err)
	}
	if primary.calls != 1 {
		t.Fatalf("primary calls = %d, want 1", primary.calls)
	}
}
