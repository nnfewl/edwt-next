// Package obs provides Prometheus metrics, health endpoints, and a status view.
package obs

import (
	"context"
	"encoding/json"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Metrics holds the worker's Prometheus collectors.
type Metrics struct {
	PollTotal    *prometheus.CounterVec
	PollDuration prometheus.Histogram
	SourceStatus prometheus.Gauge
	ArchiveTotal *prometheus.CounterVec
	ArchiveBytes prometheus.Counter
	RowsInserted *prometheus.CounterVec
	LastPoll     prometheus.Gauge
	LastArchive  prometheus.Gauge
	Up           prometheus.Gauge
}

// NewMetrics registers and returns the collectors.
func NewMetrics(reg prometheus.Registerer) *Metrics {
	m := &Metrics{
		PollTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "edwt_poll_total", Help: "Polls by result.",
		}, []string{"result"}),
		PollDuration: prometheus.NewHistogram(prometheus.HistogramOpts{
			Name: "edwt_poll_duration_seconds", Help: "Poll cycle duration.",
			Buckets: prometheus.DefBuckets,
		}),
		SourceStatus: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "edwt_source_http_status", Help: "Last upstream HTTP status.",
		}),
		ArchiveTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "edwt_archive_total", Help: "R2 archive writes by result.",
		}, []string{"result"}),
		ArchiveBytes: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "edwt_archive_bytes_total", Help: "Raw bytes archived (pre-gzip).",
		}),
		RowsInserted: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "edwt_rows_inserted_total", Help: "New rows inserted by table.",
		}, []string{"table"}),
		LastPoll: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "edwt_last_successful_poll_timestamp_seconds", Help: "Unix time of last successful poll.",
		}),
		LastArchive: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "edwt_last_successful_archive_timestamp_seconds", Help: "Unix time of last successful archive.",
		}),
		Up: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "edwt_up", Help: "1 if the worker process is up.",
		}),
	}
	reg.MustRegister(m.PollTotal, m.PollDuration, m.SourceStatus, m.ArchiveTotal,
		m.ArchiveBytes, m.RowsInserted, m.LastPoll, m.LastArchive, m.Up)
	// Standard Go runtime + process collectors (go_*, process_*) — a custom
	// registry omits these unless registered explicitly.
	reg.MustRegister(
		collectors.NewGoCollector(),
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
	)
	m.Up.Set(1)
	return m
}

// Status tracks freshness for health endpoints and the status view.
type Status struct {
	startedAt       time.Time
	lastPollUnix    atomic.Int64
	lastArchiveUnix atomic.Int64
	sourceOK        atomic.Bool
}

// NewStatus returns a Status with the start time set to now.
func NewStatus() *Status { return &Status{startedAt: time.Now()} }

// MarkPoll records a successful poll at the current time.
func (s *Status) MarkPoll() { s.lastPollUnix.Store(time.Now().Unix()) }

// MarkArchive records a successful archive at the current time.
func (s *Status) MarkArchive() { s.lastArchiveUnix.Store(time.Now().Unix()) }

// MarkSource records whether the last upstream fetch succeeded.
func (s *Status) MarkSource(ok bool) { s.sourceOK.Store(ok) }

func (s *Status) lastArchive() time.Time { return unixOrZero(s.lastArchiveUnix.Load()) }
func (s *Status) lastPoll() time.Time    { return unixOrZero(s.lastPollUnix.Load()) }

func unixOrZero(u int64) time.Time {
	if u == 0 {
		return time.Time{}
	}
	return time.Unix(u, 0)
}

// Pinger is the subset of the store used for readiness checks.
type Pinger interface {
	Ping(ctx context.Context) error
}

// Component is the health of one named subsystem.
type Component struct {
	Name    string
	Healthy bool
	Detail  string
}

// Evaluator computes component health from the worker's live state. It is the
// single source of truth shared by /api/status and the incident.io reconciler.
type Evaluator struct {
	Status         *Status
	DB             Pinger // nil when not writing to a DB
	MaxStaleness   time.Duration
	ArchiveEnabled bool
}

// Evaluate returns the current health of each component.
func (e Evaluator) Evaluate(ctx context.Context) []Component {
	upstream := e.Status.sourceOK.Load()

	la := e.Status.lastArchive()
	archive := !e.ArchiveEnabled || (!la.IsZero() && time.Since(la) <= e.MaxStaleness)

	db := true
	if e.DB != nil {
		dctx, cancel := context.WithTimeout(ctx, 2*time.Second)
		defer cancel()
		db = e.DB.Ping(dctx) == nil
	}

	return []Component{
		{Name: "upstream", Healthy: upstream, Detail: "edwaittimes feed fetch"},
		{Name: "archive", Healthy: archive, Detail: "R2 archive freshness"},
		{Name: "database", Healthy: db, Detail: "Supabase connectivity"},
	}
}

// ServerDeps wires the metrics/health/status HTTP server.
type ServerDeps struct {
	Addr           string
	Registry       *prometheus.Registry
	Status         *Status
	DB             Pinger // nil when not writing to a DB
	MaxStaleness   time.Duration
	ArchiveEnabled bool
}

// NewServer builds the metrics/health/status HTTP server.
func NewServer(d ServerDeps) *http.Server {
	mux := http.NewServeMux()
	mux.Handle("GET /metrics", promhttp.HandlerFor(d.Registry, promhttp.HandlerOpts{}))

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		if d.DB != nil {
			ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
			defer cancel()
			if err := d.DB.Ping(ctx); err != nil {
				http.Error(w, "db unavailable", http.StatusServiceUnavailable)
				return
			}
		}
		if d.ArchiveEnabled {
			la := d.Status.lastArchive()
			if la.IsZero() || time.Since(la) > d.MaxStaleness {
				http.Error(w, "archive stale", http.StatusServiceUnavailable)
				return
			}
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ready"))
	})

	mux.HandleFunc("GET /api/status", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, d.statusView())
	})

	return &http.Server{Addr: d.Addr, Handler: mux}
}

func (d ServerDeps) evaluator() Evaluator {
	return Evaluator{
		Status:         d.Status,
		DB:             d.DB,
		MaxStaleness:   d.MaxStaleness,
		ArchiveEnabled: d.ArchiveEnabled,
	}
}

func (d ServerDeps) statusView() map[string]any {
	components := map[string]string{}
	for _, c := range d.evaluator().Evaluate(context.Background()) {
		if c.Healthy {
			components[c.Name] = "operational"
		} else {
			components[c.Name] = "major_outage"
		}
	}
	return map[string]any{
		"components":     components,
		"last_poll":      timeStr(d.Status.lastPoll()),
		"last_archive":   timeStr(d.Status.lastArchive()),
		"uptime_seconds": int(time.Since(d.Status.startedAt).Seconds()),
	}
}

func timeStr(t time.Time) any {
	if t.IsZero() {
		return nil
	}
	return t.UTC().Format(time.RFC3339)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
