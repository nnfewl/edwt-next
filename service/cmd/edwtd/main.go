// Command edwtd is the edwt-next collector worker: it archives raw feed
// payloads to Cloudflare R2 and writes wait-time data to Postgres (a second
// writer alongside the Supabase Edge Function), exposing Prometheus metrics
// and health endpoints.
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/getsentry/sentry-go"
	sentryhttp "github.com/getsentry/sentry-go/http"
	sentryslog "github.com/getsentry/sentry-go/slog"
	"github.com/prometheus/client_golang/prometheus"

	"github.com/nnfewl/edwt-next/service/internal/archive"
	"github.com/nnfewl/edwt-next/service/internal/config"
	"github.com/nnfewl/edwt-next/service/internal/notify"
	"github.com/nnfewl/edwt-next/service/internal/obs"
	"github.com/nnfewl/edwt-next/service/internal/poller"
	"github.com/nnfewl/edwt-next/service/internal/store"
)

// release is injected at build time: -ldflags="-X main.release=<tag>".
var release string

// multiHandler fans slog records out to multiple handlers.
type multiHandler struct{ hs []slog.Handler }

func (m multiHandler) Enabled(ctx context.Context, l slog.Level) bool {
	for _, h := range m.hs {
		if h.Enabled(ctx, l) {
			return true
		}
	}
	return false
}

func (m multiHandler) Handle(ctx context.Context, r slog.Record) error {
	for _, h := range m.hs {
		if h.Enabled(ctx, r.Level) {
			_ = h.Handle(ctx, r.Clone())
		}
	}
	return nil
}

func (m multiHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	hs := make([]slog.Handler, len(m.hs))
	for i, h := range m.hs {
		hs[i] = h.WithAttrs(attrs)
	}
	return multiHandler{hs}
}

func (m multiHandler) WithGroup(name string) slog.Handler {
	hs := make([]slog.Handler, len(m.hs))
	for i, h := range m.hs {
		hs[i] = h.WithGroup(name)
	}
	return multiHandler{hs}
}

func main() {
	if err := sentry.Init(sentry.ClientOptions{
		Dsn:              os.Getenv("SENTRY_DSN"),
		Environment:      os.Getenv("SENTRY_ENVIRONMENT"),
		Release:          release,
		AttachStacktrace: true,
		SendDefaultPII:   true,
		EnableTracing:    true,
		TracesSampleRate: 1.0,
		EnableLogs:       true,
		BeforeSendTransaction: func(event *sentry.Event, _ *sentry.EventHint) *sentry.Event {
			// Exclude noisy health/metrics endpoints from performance data.
			switch event.Transaction {
			case "GET /healthz", "GET /readyz", "GET /metrics":
				return nil
			}
			return event
		},
	}); err != nil {
		slog.Error("sentry.Init failed", "err", err)
	}
	defer sentry.Flush(2 * time.Second)

	sentryHandler := sentryslog.Option{
		// slog.LevelError and above → Sentry Events (issues + alerts)
		EventLevel: []slog.Level{slog.LevelError},
		// Info and above → Sentry Logs (searchable log feed)
		LogLevel:  []slog.Level{slog.LevelInfo, slog.LevelWarn, slog.LevelError},
		AddSource: true,
	}.NewSentryHandler(context.Background())

	log := slog.New(multiHandler{[]slog.Handler{
		slog.NewJSONHandler(os.Stdout, nil),
		sentryHandler,
	}})

	cfg, err := config.Load()
	if err != nil {
		log.Error("config", "err", err)
		sentry.Flush(2 * time.Second)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	reg := prometheus.NewRegistry()
	metrics := obs.NewMetrics(reg)
	status := obs.NewStatus()

	// Archiver: local disk is the primary (always on, source of truth). R2 is
	// best-effort on top — failures are logged, never block the poll cycle.
	disk, err := archive.NewDisk(cfg.ArchiveDir)
	if err != nil {
		log.Error("disk archive init", "dir", cfg.ArchiveDir, "err", err)
		sentry.Flush(2 * time.Second)
		os.Exit(1)
	}
	log.Info("disk archiver enabled", "dir", disk.Root())

	var arch poller.Archiver = disk
	if cfg.R2.Enabled() {
		r2, err := archive.New(ctx, cfg.R2)
		if err != nil {
			log.Error("r2 init", "err", err)
			sentry.Flush(2 * time.Second)
			os.Exit(1)
		}
		arch = archive.NewComposite(disk, r2, log)
		log.Info("r2 archiver enabled (best-effort)", "bucket", cfg.R2.Bucket)
	} else {
		log.Warn("R2 not configured — disk-only archiving")
	}

	// Postgres second writer (default on; EDWT_WRITE_DB=false for archive-only).
	var db poller.DBWriter
	var pinger obs.Pinger
	if cfg.WriteDB {
		st, err := store.New(ctx, cfg.DatabaseURL)
		if err != nil {
			log.Error("db connect", "err", err)
			sentry.Flush(2 * time.Second)
			os.Exit(1)
		}
		defer st.Close()
		db = st
		pinger = st
		log.Info("db second-writer enabled")
	} else {
		log.Warn("EDWT_WRITE_DB=false — DB writes disabled (archive-only)")
	}

	p := poller.New(cfg.SourceURL, &http.Client{Timeout: 30 * time.Second}, arch, db, metrics, status, log)

	srv := obs.NewServer(obs.ServerDeps{
		Addr:                 cfg.HTTPAddr,
		Registry:             reg,
		Status:               status,
		DB:                   pinger,
		ArchiveEnabled:       arch != nil,
		SourceFailThreshold:  cfg.SourceFailThreshold,
		ArchiveFailThreshold: cfg.ArchiveFailThreshold,
	})
	// Wrap with Sentry: captures panics in handlers and creates per-request spans.
	srv.Handler = sentryhttp.New(sentryhttp.Options{Repanic: true}).Handle(srv.Handler)

	// incident.io status push (optional) — evaluates the same component health
	// as /api/status and fires/resolves alerts on transitions.
	if cfg.IncidentIO.Enabled() {
		rec := notify.NewReconciler(
			obs.Evaluator{Status: status, DB: pinger, ArchiveEnabled: arch != nil, SourceFailThreshold: cfg.SourceFailThreshold, ArchiveFailThreshold: cfg.ArchiveFailThreshold},
			notify.NewIncidentIO(cfg.IncidentIO.URL(), cfg.IncidentIO.Token),
			cfg.IncidentIO.ReconcileInterval,
			log,
		)
		go withRecover(sentry.CurrentHub().Clone(), func() { rec.Run(ctx) })
		log.Info("incident.io reconciler enabled", "interval", cfg.IncidentIO.ReconcileInterval)
	}

	go func(hub *sentry.Hub) {
		log.Info("http listening", "addr", cfg.HTTPAddr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("http server", "err", err)
			hub.CaptureException(err)
			stop()
		}
	}(sentry.CurrentHub().Clone())

	go withRecover(sentry.CurrentHub().Clone(), func() { p.Run(ctx, cfg.PollInterval) })

	<-ctx.Done()
	log.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error("http shutdown", "err", err)
	}
}

// withRecover runs fn in the current goroutine, sending any panic to Sentry
// via hub before re-panicking so the runtime still prints the stack.
func withRecover(hub *sentry.Hub, fn func()) {
	defer func() {
		if r := recover(); r != nil {
			hub.Recover(r)
			sentry.Flush(2 * time.Second)
			panic(r)
		}
	}()
	fn()
}
