# Status-page POC: incident.io (two alert paths)

Goal: prove which approach catches which failure by feeding **both** into the same
incident.io account and comparing.

- **Path 1 — worker self-push** (`edwtd` → incident.io HTTP alert source). Rich,
  per-component, fast. **Blind if the worker/host itself dies.** Implemented in
  [`service/internal/notify/`](../../service/internal/notify/).
- **Path 2 — external monitor** (Better Stack / UptimeRobot → incident.io) hitting the
  public `/healthz` + `/readyz`. Observes from outside, so it **catches worker-down**.

## Path 1 — set up

1. In incident.io: **Settings → Alerts → Alert sources → New → HTTP**. Copy the
   `{config_id}` from the source URL (`…/v2/alert_events/http/<config_id>`) and the
   **bearer token**.
2. Add a rule so firing alerts create/update an incident (and a status-page component
   if you want the public dot to move).
3. Configure the worker:
   ```
   INCIDENTIO_ALERT_SOURCE_ID=<config_id>
   INCIDENTIO_ALERT_TOKEN=<token>
   INCIDENTIO_RECONCILE_INTERVAL=30s
   ```
   Components evaluated: `upstream` (feed fetch), `archive` (R2 freshness),
   `database` (Supabase ping — only when `EDWT_WRITE_DB=true`).

### Quick local smoke test (no VPS, no DB, no R2 needed)

Drive `upstream` unhealthy by pointing at a dead URL — the reconciler fires within
one interval, then resolves when you fix it:

```bash
cd service && make build
EDWT_WRITE_DB=false \
EDWT_SOURCE_URL=https://www.edwaittimes.ca/nope-404 \
INCIDENTIO_ALERT_SOURCE_ID=<id> INCIDENTIO_ALERT_TOKEN=<token> \
INCIDENTIO_RECONCILE_INTERVAL=15s \
./bin/edwtd
# → incident.io shows an `edwt-upstream` alert firing.
# Restart with the correct EDWT_SOURCE_URL → it resolves (same dedup key).
```

For the `archive` component: run with real (or deliberately wrong) R2 creds and a
short `EDWT_READY_MAX_STALENESS=30s`; a failing/stale archive fires `edwt-archive`.

## Path 2 — set up (needs the worker reachable, i.e. the VPS deploy)

Point an external monitor at the worker's public endpoints:
- `GET /healthz` — liveness (process up).
- `GET /readyz` — DB ping **and** archive freshness; returns 503 when degraded, so it
  already covers DB-down and archive-stale from outside.

Forward the monitor's alerts into incident.io (most have a native incident.io
integration, or POST to a second HTTP alert source).

## The comparison (what the POC should show)

| Scenario | Path 1 (self-push) | Path 2 (external) |
|---|---|---|
| Bad R2 creds (worker up) | fires `edwt-archive` fast, precise | fires via `/readyz` 503 (less specific) |
| DB unreachable (worker up) | fires `edwt-database` | fires via `/readyz` 503 |
| **Worker / VPS down** | **silent — blind spot** | **fires — this is the point** |

Conclusion to validate: Path 1 gives fast, component-level detail; Path 2 is the
safety net for the worker itself. Keep both, or keep Path 2 + a coarse self-push.

## Notes

- Same `deduplication_key` per component (`edwt-<component>`) means repeats are safe
  and a `resolved` event closes the matching firing alert.
- The reconciler only sends on **transitions**, so it won't spam incident.io.
- `INCIDENTIO_*` unset ⇒ the reconciler is disabled (no-op).
