package obs

import (
	"context"
	"testing"
)

// Regression: at startup the reconciler used to see upstream as unhealthy
// (sourceOK defaults to false) and emit a phantom `firing` before the poller
// had even attempted a fetch. The fix is to treat upstream as healthy until
// at least one MarkSource call has happened.
func TestEvaluateBeforeFirstPollDoesNotReportUpstreamUnhealthy(t *testing.T) {
	s := NewStatus()
	e := Evaluator{Status: s, ArchiveEnabled: false}
	for _, c := range e.Evaluate(context.Background()) {
		if c.Name == "upstream" && !c.Healthy {
			t.Fatalf("upstream reported unhealthy before any MarkSource call: %+v", c)
		}
	}
}

func TestEvaluateAfterFailedFirstPollReportsUpstreamUnhealthy(t *testing.T) {
	s := NewStatus()
	s.MarkSource(false) // poller attempted, fetch failed
	e := Evaluator{Status: s, ArchiveEnabled: false}
	for _, c := range e.Evaluate(context.Background()) {
		if c.Name == "upstream" && c.Healthy {
			t.Fatalf("upstream should be unhealthy after MarkSource(false): %+v", c)
		}
	}
}

func TestEvaluateAfterSuccessfulPollReportsUpstreamHealthy(t *testing.T) {
	s := NewStatus()
	s.MarkSource(true)
	e := Evaluator{Status: s, ArchiveEnabled: false}
	for _, c := range e.Evaluate(context.Background()) {
		if c.Name == "upstream" && !c.Healthy {
			t.Fatalf("upstream should be healthy after MarkSource(true): %+v", c)
		}
	}
}

// A single transient fetch failure must not flip upstream unhealthy when a
// debounce threshold is configured — this is what caused incident.io to flap
// firing/resolved on every upstream network blip.
func TestEvaluateBelowFailThresholdReportsUpstreamHealthy(t *testing.T) {
	s := NewStatus()
	s.MarkSource(false)
	s.MarkSource(false) // two consecutive failures, threshold is 3
	e := Evaluator{Status: s, ArchiveEnabled: false, SourceFailThreshold: 3}
	for _, c := range e.Evaluate(context.Background()) {
		if c.Name == "upstream" && !c.Healthy {
			t.Fatalf("upstream unhealthy after 2 fails under threshold 3: %+v", c)
		}
	}
}

func TestEvaluateAtFailThresholdReportsUpstreamUnhealthy(t *testing.T) {
	s := NewStatus()
	s.MarkSource(false)
	s.MarkSource(false)
	s.MarkSource(false) // reaches threshold of 3
	e := Evaluator{Status: s, ArchiveEnabled: false, SourceFailThreshold: 3}
	for _, c := range e.Evaluate(context.Background()) {
		if c.Name == "upstream" && c.Healthy {
			t.Fatalf("upstream should be unhealthy at fail threshold 3: %+v", c)
		}
	}
}

func TestSourceSuccessResetsFailCount(t *testing.T) {
	s := NewStatus()
	s.MarkSource(false)
	s.MarkSource(false)
	s.MarkSource(true)  // recovery resets the streak
	s.MarkSource(false) // a fresh blip — well under threshold again
	e := Evaluator{Status: s, ArchiveEnabled: false, SourceFailThreshold: 3}
	for _, c := range e.Evaluate(context.Background()) {
		if c.Name == "upstream" && !c.Healthy {
			t.Fatalf("a success should reset the fail streak: %+v", c)
		}
	}
}

// Regression for the archive component's analogous phantom-firing: at cold
// start, lastArchive is zero but no poll has run yet, so the staleness check
// must NOT report archive as unhealthy.
func TestEvaluateBeforeFirstPollDoesNotReportArchiveUnhealthy(t *testing.T) {
	s := NewStatus()
	e := Evaluator{Status: s, ArchiveEnabled: true, MaxStaleness: 1}
	for _, c := range e.Evaluate(context.Background()) {
		if c.Name == "archive" && !c.Healthy {
			t.Fatalf("archive reported unhealthy before any MarkSource call: %+v", c)
		}
	}
}
