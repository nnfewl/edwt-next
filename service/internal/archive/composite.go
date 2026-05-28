package archive

import (
	"context"
	"log/slog"
)

// putter is the minimal archiver shape: this matches poller.Archiver without
// importing it (avoids a cycle).
type putter interface {
	Put(ctx context.Context, key string, body []byte) error
}

// Composite archives to a primary backend that must succeed and an optional
// secondary backend that runs best-effort: a secondary failure is logged but
// never returned. Use this to make local-disk archiving the source of truth
// while still uploading to R2 when it's reachable.
type Composite struct {
	primary   putter
	secondary putter // may be nil
	log       *slog.Logger
}

// NewComposite wires a required primary and an optional secondary. Pass a
// non-nil logger; secondary failures are logged at Warn.
func NewComposite(primary putter, secondary putter, log *slog.Logger) *Composite {
	return &Composite{primary: primary, secondary: secondary, log: log}
}

// Put writes to the primary first. If that succeeds and a secondary is set,
// it also writes there but ignores the error (logged as a warning) — the poll
// cycle stays green even when R2 is unreachable or misconfigured.
func (c *Composite) Put(ctx context.Context, key string, body []byte) error {
	if err := c.primary.Put(ctx, key, body); err != nil {
		return err
	}
	if c.secondary == nil {
		return nil
	}
	if err := c.secondary.Put(ctx, key, body); err != nil {
		c.log.Warn("secondary archive failed (best-effort)", "key", key, "err", err)
	}
	return nil
}
