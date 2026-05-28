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
