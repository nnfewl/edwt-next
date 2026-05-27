package notify

import (
	"context"
	"log/slog"
	"time"

	"github.com/nnfewl/edwt-next/service/internal/obs"
)

// Evaluator yields current component health (obs.Evaluator satisfies this).
type Evaluator interface {
	Evaluate(ctx context.Context) []obs.Component
}

// Reconciler evaluates component health on an interval and pushes incident.io
// alerts on state transitions only — firing when a component goes unhealthy,
// resolved when it recovers. The dedup key per component makes repeats safe.
type Reconciler struct {
	eval     Evaluator
	sender   Sender
	interval time.Duration
	log      *slog.Logger
	last     map[string]bool // component name -> last healthy state we acted on
}

// NewReconciler builds a Reconciler.
func NewReconciler(eval Evaluator, sender Sender, interval time.Duration, log *slog.Logger) *Reconciler {
	return &Reconciler{eval: eval, sender: sender, interval: interval, log: log, last: map[string]bool{}}
}

// tick evaluates once and sends any needed transitions.
func (r *Reconciler) tick(ctx context.Context) {
	for _, c := range r.eval.Evaluate(ctx) {
		prev, seen := r.last[c.Name]
		switch {
		case seen && prev == c.Healthy:
			continue // no change
		case !seen && c.Healthy:
			r.last[c.Name] = true // first seen healthy — record, nothing to resolve
			continue
		}

		ev := AlertEvent{
			DeduplicationKey: "edwt-" + c.Name,
			Title:            "edwt collector: " + c.Name,
			Metadata:         map[string]any{"component": c.Name},
		}
		if c.Healthy {
			ev.Status = "resolved"
			ev.Description = c.Detail + " recovered"
		} else {
			ev.Status = "firing"
			ev.Description = c.Detail + " is unhealthy"
		}

		if err := r.sender.Send(ctx, ev); err != nil {
			r.log.Error("incident.io send failed", "component", c.Name, "status", ev.Status, "err", err)
			continue // leave r.last unchanged so we retry next tick
		}
		r.log.Info("incident.io alert sent", "component", c.Name, "status", ev.Status)
		r.last[c.Name] = c.Healthy
	}
}

// Run reconciles every interval until ctx is cancelled; first tick is immediate.
func (r *Reconciler) Run(ctx context.Context) {
	t := time.NewTicker(r.interval)
	defer t.Stop()
	r.tick(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			r.tick(ctx)
		}
	}
}
