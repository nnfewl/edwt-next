// Package poller orchestrates one poll: fetch -> archive (R2) -> write (DB).
package poller

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/nnfewl/edwt-next/service/internal/archive"
	"github.com/nnfewl/edwt-next/service/internal/edwt"
	"github.com/nnfewl/edwt-next/service/internal/obs"
	"github.com/nnfewl/edwt-next/service/internal/store"
)

// Archiver writes raw payloads to object storage.
type Archiver interface {
	Put(ctx context.Context, key string, body []byte) error
}

// DBWriter persists decoded items to Postgres.
type DBWriter interface {
	Write(ctx context.Context, items []edwt.Location, now time.Time) (store.WriteResult, error)
}

// Poller runs poll cycles. arch and/or db may be nil to disable that leg.
type Poller struct {
	sourceURL string
	client    *http.Client
	arch      Archiver
	db        DBWriter
	m         *obs.Metrics
	status    *obs.Status
	log       *slog.Logger
}

// New builds a Poller.
func New(sourceURL string, client *http.Client, arch Archiver, db DBWriter, m *obs.Metrics, status *obs.Status, log *slog.Logger) *Poller {
	return &Poller{sourceURL: sourceURL, client: client, arch: arch, db: db, m: m, status: status, log: log}
}

// Outcome summarizes a poll.
type Outcome struct {
	Status      int
	Locations   int
	NewReadings int
	Archived    bool
	DurationMs  int64
}

// RunOnce performs one full poll cycle: fetch, archive the raw payload (primary
// job), then write decoded data to the DB (second writer). Archiving happens
// before decode so a malformed payload is still preserved.
func (p *Poller) RunOnce(ctx context.Context) (Outcome, error) {
	start := time.Now()
	fr, err := edwt.Fetch(ctx, p.client, p.sourceURL)
	p.m.SourceStatus.Set(float64(fr.Status))
	p.status.MarkSource(err == nil)
	if err != nil {
		p.m.PollTotal.WithLabelValues("fetch_error").Inc()
		return Outcome{}, err
	}

	out := Outcome{Status: fr.Status, DurationMs: fr.DurationMs}

	if p.arch != nil {
		key := archive.Key(start, fr.Body)
		if err := p.arch.Put(ctx, key, fr.Body); err != nil {
			p.m.ArchiveTotal.WithLabelValues("error").Inc()
			p.log.Error("archive failed", "key", key, "err", err)
		} else {
			p.m.ArchiveTotal.WithLabelValues("ok").Inc()
			p.m.ArchiveBytes.Add(float64(len(fr.Body)))
			p.m.LastArchive.SetToCurrentTime()
			p.status.MarkArchive()
			out.Archived = true
		}
	}

	if p.db != nil {
		items, err := edwt.Decode(fr.Body)
		if err != nil {
			p.m.PollTotal.WithLabelValues("decode_error").Inc()
			return out, err
		}
		res, err := p.db.Write(ctx, items, time.Now())
		if err != nil {
			p.m.PollTotal.WithLabelValues("db_error").Inc()
			return out, err
		}
		p.m.RowsInserted.WithLabelValues("locations").Add(float64(res.Locations))
		p.m.RowsInserted.WithLabelValues("wait_time_readings").Add(float64(res.NewReadings))
		out.Locations = res.Locations
		out.NewReadings = res.NewReadings
	}

	p.status.MarkPoll()
	p.m.LastPoll.SetToCurrentTime()
	p.m.PollTotal.WithLabelValues("ok").Inc()
	p.m.PollDuration.Observe(time.Since(start).Seconds())
	p.log.Info("poll ok", "status", out.Status, "locations", out.Locations,
		"newReadings", out.NewReadings, "archived", out.Archived, "ms", out.DurationMs)
	return out, nil
}

// Run polls every interval until ctx is cancelled; the first poll fires
// immediately.
func (p *Poller) Run(ctx context.Context, interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	if _, err := p.RunOnce(ctx); err != nil {
		p.log.Error("poll failed", "err", err)
	}
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if _, err := p.RunOnce(ctx); err != nil {
				p.log.Error("poll failed", "err", err)
			}
		}
	}
}
