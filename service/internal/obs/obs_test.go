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

// At cold start no archive write has been attempted, so the archiver must not
// report unhealthy.
func TestEvaluateBeforeFirstPollDoesNotReportArchiveUnhealthy(t *testing.T) {
	s := NewStatus()
	e := Evaluator{Status: s, ArchiveEnabled: true, ArchiveFailThreshold: 3}
	for _, c := range e.Evaluate(context.Background()) {
		if c.Name == "archive" && !c.Healthy {
			t.Fatalf("archive reported unhealthy before any write: %+v", c)
		}
	}
}

// The bug: a run of failed upstream polls never reaches the archive write, yet
// the old freshness check aged `lastArchive` past the staleness window and
// flagged the archiver unhealthy — a false outage on a component that never
// failed. Archive health must depend on actual write outcomes, not data
// freshness, so upstream flakiness leaves it healthy.
func TestArchiveHealthyWhenUpstreamFailsWithoutWriteAttempt(t *testing.T) {
	s := NewStatus()
	s.MarkSource(false)
	s.MarkSource(false)
	s.MarkSource(false) // upstream down; the archiver was never even invoked
	e := Evaluator{Status: s, ArchiveEnabled: true, ArchiveFailThreshold: 3}
	for _, c := range e.Evaluate(context.Background()) {
		if c.Name == "archive" && !c.Healthy {
			t.Fatalf("archive must stay healthy when no write failed: %+v", c)
		}
	}
}

func TestArchiveUnhealthyAfterConsecutiveWriteFailures(t *testing.T) {
	s := NewStatus()
	s.MarkArchive(false)
	s.MarkArchive(false)
	s.MarkArchive(false) // three real write failures, threshold 3
	e := Evaluator{Status: s, ArchiveEnabled: true, ArchiveFailThreshold: 3}
	for _, c := range e.Evaluate(context.Background()) {
		if c.Name == "archive" && c.Healthy {
			t.Fatalf("archive should be unhealthy after 3 write failures: %+v", c)
		}
	}
}

func TestArchiveWriteSuccessResetsFailCount(t *testing.T) {
	s := NewStatus()
	s.MarkArchive(false)
	s.MarkArchive(false)
	s.MarkArchive(true)  // a successful write clears the streak
	s.MarkArchive(false) // a lone failure again — well under threshold
	e := Evaluator{Status: s, ArchiveEnabled: true, ArchiveFailThreshold: 3}
	for _, c := range e.Evaluate(context.Background()) {
		if c.Name == "archive" && !c.Healthy {
			t.Fatalf("a successful write should reset the fail streak: %+v", c)
		}
	}
}
