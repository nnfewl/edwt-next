// Package store persists feed data to Postgres (Supabase) as a second writer.
package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/nnfewl/edwt-next/service/internal/edwt"
)

// Store is a pgx pool wrapper with the worker's write + read queries.
type Store struct {
	pool *pgxpool.Pool
}

// New opens a pgx pool and verifies connectivity.
func New(ctx context.Context, dsn string) (*Store, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &Store{pool: pool}, nil
}

// Close releases the pool.
func (s *Store) Close() { s.pool.Close() }

// Ping checks DB connectivity (used by /readyz).
func (s *Store) Ping(ctx context.Context) error { return s.pool.Ping(ctx) }

// WriteResult reports how many rows a Write touched.
type WriteResult struct {
	Locations   int
	NewReadings int
}

const locUpsertSQL = `
insert into locations (
  id, name, slug, type, status, address, website, phone, description, audience,
  latitude, longitude, open247, show_wait_times, show_status, wait_time_fallback,
  operating_hours, alert, metadata, last_seen_at
) values (
  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
  $11,$12,$13,$14,$15,$16,
  $17::jsonb,$18::jsonb,$19::jsonb,$20
)
on conflict (id) do update set
  name = excluded.name, slug = excluded.slug, type = excluded.type,
  status = excluded.status, address = excluded.address, website = excluded.website,
  phone = excluded.phone, description = excluded.description, audience = excluded.audience,
  latitude = excluded.latitude, longitude = excluded.longitude, open247 = excluded.open247,
  show_wait_times = excluded.show_wait_times, show_status = excluded.show_status,
  wait_time_fallback = excluded.wait_time_fallback, operating_hours = excluded.operating_hours,
  alert = excluded.alert, metadata = excluded.metadata, last_seen_at = excluded.last_seen_at`

const readingInsertSQL = `
insert into wait_time_readings (
  location_id, report_id, reading_id, reading_created_at,
  wait_time_minutes, elos_minutes, status, has_wait_time
) values ($1,$2,$3,$4,$5,$6,$7,true)
on conflict (location_id, report_id) do nothing
returning id`

// Write upserts all locations and inserts new readings, deduped on
// (location_id, report_id). It is idempotent, so running alongside the Edge
// Function never creates duplicates.
func (s *Store) Write(ctx context.Context, items []edwt.Location, now time.Time) (WriteResult, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return WriteResult{}, err
	}
	defer tx.Rollback(ctx)

	// locations — one batched round trip of upserts.
	if len(items) > 0 {
		locBatch := &pgx.Batch{}
		for _, it := range items {
			locBatch.Queue(locUpsertSQL, locArgs(it, now)...)
		}
		lbr := tx.SendBatch(ctx, locBatch)
		for range items {
			if _, err := lbr.Exec(); err != nil {
				lbr.Close()
				return WriteResult{}, err
			}
		}
		if err := lbr.Close(); err != nil {
			return WriteResult{}, err
		}
	}

	// readings — only facilities reporting a reportId; RETURNING id lets us
	// count the rows actually inserted (a conflict returns no row).
	var withWT []edwt.Location
	for _, it := range items {
		if it.WaitTime != nil && it.WaitTime.ReportID != "" {
			withWT = append(withWT, it)
		}
	}
	newReadings := 0
	if len(withWT) > 0 {
		rBatch := &pgx.Batch{}
		for _, it := range withWT {
			rBatch.Queue(readingInsertSQL, readingArgs(it)...)
		}
		rbr := tx.SendBatch(ctx, rBatch)
		for range withWT {
			var id int64
			switch err := rbr.QueryRow().Scan(&id); {
			case err == nil:
				newReadings++
			case errors.Is(err, pgx.ErrNoRows):
				// conflict — this report was already stored (by us or the Edge Function)
			default:
				rbr.Close()
				return WriteResult{}, err
			}
		}
		if err := rbr.Close(); err != nil {
			return WriteResult{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return WriteResult{}, err
	}
	return WriteResult{Locations: len(items), NewReadings: newReadings}, nil
}

func locArgs(it edwt.Location, now time.Time) []any {
	name := it.Name
	if name == "" {
		name = "(unknown)"
	}
	alert, _ := json.Marshal(map[string]any{
		"alertShow":        it.AlertShow,
		"alertTitle":       it.AlertTitle,
		"alertDescription": it.AlertDescription,
	})
	return []any{
		it.ID, name, it.Slug, it.Type, it.Status, it.Address, it.Website, it.Phone,
		it.Description, it.Audience, it.Latitude, it.Longitude, it.Open247,
		it.ShowWaitTimes, it.ShowStatus, it.WaitTimeFallback,
		jsonbArg(it.OperatingHours), string(alert), string(it.Raw), now,
	}
}

func readingArgs(it edwt.Location) []any {
	wt := it.WaitTime
	return []any{
		it.ID, wt.ReportID, strPtrOrNil(wt.ID), parseTime(wt.CreatedAt),
		wt.WaitTimeMinutes, wt.ElosMinutes, wt.Status,
	}
}

// jsonbArg returns raw JSON as a string for a jsonb column, or nil for
// absent/null input (so the column is SQL NULL, not the JSON literal null).
func jsonbArg(r json.RawMessage) any {
	if len(r) == 0 || string(r) == "null" {
		return nil
	}
	return string(r)
}

func strPtrOrNil(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func parseTime(s string) any {
	if s == "" {
		return nil
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return nil
	}
	return t
}
