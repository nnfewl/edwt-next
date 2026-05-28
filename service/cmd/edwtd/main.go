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

	"github.com/prometheus/client_golang/prometheus"

	"github.com/nnfewl/edwt-next/service/internal/archive"
	"github.com/nnfewl/edwt-next/service/internal/config"
	"github.com/nnfewl/edwt-next/service/internal/notify"
	"github.com/nnfewl/edwt-next/service/internal/obs"
	"github.com/nnfewl/edwt-next/service/internal/poller"
	"github.com/nnfewl/edwt-next/service/internal/store"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	cfg, err := config.Load()
	if err != nil {
		log.Error("config", "err", err)
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
		os.Exit(1)
	}
	log.Info("disk archiver enabled", "dir", disk.Root())

	var arch poller.Archiver = disk
	if cfg.R2.Enabled() {
		r2, err := archive.New(ctx, cfg.R2)
		if err != nil {
			log.Error("r2 init", "err", err)
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
		Addr:           cfg.HTTPAddr,
		Registry:       reg,
		Status:         status,
		DB:             pinger,
		MaxStaleness:   cfg.ReadyMaxStaleness,
		ArchiveEnabled: arch != nil,
	})

	// incident.io status push (optional) — evaluates the same component health
	// as /api/status and fires/resolves alerts on transitions.
	if cfg.IncidentIO.Enabled() {
		rec := notify.NewReconciler(
			obs.Evaluator{Status: status, DB: pinger, MaxStaleness: cfg.ReadyMaxStaleness, ArchiveEnabled: arch != nil},
			notify.NewIncidentIO(cfg.IncidentIO.URL(), cfg.IncidentIO.Token),
			cfg.IncidentIO.ReconcileInterval,
			log,
		)
		go rec.Run(ctx)
		log.Info("incident.io reconciler enabled", "interval", cfg.IncidentIO.ReconcileInterval)
	}

	go func() {
		log.Info("http listening", "addr", cfg.HTTPAddr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("http server", "err", err)
			stop()
		}
	}()

	go p.Run(ctx, cfg.PollInterval)

	<-ctx.Done()
	log.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error("http shutdown", "err", err)
	}
}
