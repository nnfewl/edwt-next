# Auto-publish workflow: incident → status.edwt.ca dot

This finishes the gap left at the end of [`statuspage-poc.md`](statuspage-poc.md):
incidents from `edwt-worker` already create live (non-triage) entries in
incident.io with the `Component` attribute resolved to a real Status Page
Component — but no one **publishes** them, so the public dot never moves.

Goal of this doc: a one-sitting, button-by-button recipe to build the
incident.io Workflow that does the publish automatically. The fiddly bit is one
custom expression; everything else is dropdowns.

## Prereqs (already done, sanity-check before you start)

- Alert source `edwt-worker` has the `Component` attribute extracting
  `$.metadata.component` → Status Page Component.
- Default alert route has **Create triage incidents = No** so incidents land
  in Active immediately.
- Status page `edwt` has the 5 components, including `Data source` /
  `Data archive` / `Database` whose names match what the Go worker sends as
  `metadata.component` (see `service/internal/obs/obs.go:139-141`).
- The Pi worker is running and has fired at least one real alert (gives you
  a known-good payload to test the expression against).

## Build the workflow

**Settings → Workflows → + New workflow → Create new workflow**

### 1. Trigger
- **"An incident is created or changed"**
- Why: the same workflow needs to fire on the initial create (Active) *and*
  on the close (Closed) — `incident.updated` covers both.

### 2. Conditions
The default "Status > Category is one of Active" gets removed (we want to
react on close too). Replace with:

- **Incident → Status → Category** `is one of` `Active`, `Closed`
- **Incident → Linked alerts** `count is at least` `1`
  *(Skips manually-declared incidents that aren't from the worker.)*
- **Incident → Linked alerts → Alert source** `is one of` `edwt-worker`
  *(Belt-and-suspenders — only run for the worker's alerts, not future
  sources.)*

### 3. Step: "Create or update a public status page incident"

Search "status page" in **Add step**, pick the **public** variant (your page
at `status.edwt.ca` is public).

Fields, in the order they appear:

#### Status page (required)
- Select `edwt` (the only one).

#### Status page components (this is the load-bearing one)
- Click the lightning bolt `⚡` → variable picker → **Σ Add new expression**.
- Build:
  - **Start with:** `Incident → Linked alerts` (returns a list)
  - **For each → Component (Status Page Component)**
  - **Reduce → First** (or "Single", whichever the UI offers — alerts in this
    project have exactly one Component each, so either works)
- Name the expression `affected_component` and save it.
- The field should now show `affected_component` (a Status Page Component
  value, not a list — important: the action wants singletons or a list
  depending on the field).

If the expression preview against a real captured alert shows `null`, the
shape is wrong; the fallback is to click into the Component attribute's
extraction path in `Settings → Alerts → edwt-worker → Attributes` and confirm
the alert's `metadata.component` is set and resolving.

#### Component impact (also expression)
- New expression: `if Incident.Status.Category == "Closed" then "Operational"
  else "Major outage"` (the picker's syntax is a small visual builder, not
  literal text — pick the conditional template and fill in the comparators).
- Name it `component_impact`.

If you'd rather hardcode for v1, set it to **Major outage** and accept that
on resolve you have to manually flip the status page component back to
Operational. The workflow will still update name/status correctly.

#### Name
- Use the **`+ Insert variable`** in the Name box → pick **Incident → Name**.
- Result is something like `edwt collector: Data source` which is fine.

#### Status (dynamic — required for the resolve flow)
- New expression: `case Incident.Status.Category:
  - "Closed" → "Resolved"
  - else → "Investigating"`
- Name it `statuspage_status`.

#### Message (public-facing)
- Plain text is fine. Suggested:
  > Investigating an issue with our data pipeline. Updates to follow.
- Or skip — incident.io will use a default.

### 4. Workflow title + activation
- Top of the page, rename "Workflow title" → `Auto-publish edwt-worker
  incidents to status page`.
- **Save as draft** first (button top-right). Don't activate yet.

## Test before activating

incident.io workflows have a "Run on…" runner in the workflow detail page
that lets you replay an existing incident through the workflow without
firing anything new. Open the draft, look for **"Run on existing incident"**
or similar.

1. Pick the most recent `edwt collector: Data source` incident.
2. The test panel shows what the workflow *would* do — verify:
   - Status page = `edwt` ✓
   - Status page components = `Data source` ✓
   - Component impact = `Major outage` (if incident is Active) or
     `Operational` (if Closed) ✓
   - Name renders correctly ✓
   - Status maps correctly ✓
3. If anything renders as `null` or blank, fix the expression and re-test.
4. When the dry-run looks right, **toggle Active** and save.

## End-to-end verification

Same smoke test as in [`statuspage-poc.md`](statuspage-poc.md), but driven
on the Pi:

```bash
# On the dev machine
ssh pi@10.0.0.73 'sudo sed -i \
  "s|^EDWT_SOURCE_URL=.*|EDWT_SOURCE_URL=https://www.edwaittimes.ca/nope-404|" \
  /etc/edwtd/edwtd.env && sudo systemctl restart edwtd'
```

Wait ~30s, then check:
- `status.edwt.ca` should show **Data source: Major outage** with a banner
- `#incidents` Slack channel should have the alert post
- A new incident should be in incident.io (Active) with affected component
  = `Data source` and the publish should already have happened (no manual
  click required)

Revert:
```bash
ssh pi@10.0.0.73 'sudo sed -i \
  "s|^EDWT_SOURCE_URL=.*|EDWT_SOURCE_URL=https://www.edwaittimes.ca/api/wait-times|" \
  /etc/edwtd/edwtd.env && sudo systemctl restart edwtd'
```

Within ~30s the worker's reconciler should send `resolved`, incident.io
closes the incident, the workflow re-fires (because it's `created or
changed`), and updates the status page incident to **Resolved** — public dot
flips back to green.

## Things that have caught me out / gotchas

- **The Component attribute lives on the alert, not the incident.** The
  variable picker shows incident properties by default; you only see alert
  attributes via the `Linked alerts → ...` path. That's why `component`
  returns "No results" in the basic search and you have to build an
  expression.
- **List vs single.** "Status page components" accepts a list. If the
  expression resolves to a Status Page Component (singleton), it gets
  promoted; if it resolves to a list, that's fine too. If it resolves to a
  string, the publish silently does nothing. Always sanity-check via the
  test runner.
- **The reconciler interval (30s) plus incident.io processing (~few s)
  means** the public dot lags real upstream state by up to ~40s in the worst
  case. Don't bisect a config issue when the system is "just working
  slowly".
- **Phantom firing on worker restart** was a real bug — fixed in
  `service/internal/obs/obs.go` via the `sourcePolled` flag. If you ever
  see a firing/resolved pair within seconds of a restart with no real cause,
  check that the fix is still in place.

## What this workflow does *not* cover

- **Path 2 (external monitor → /healthz)** from the POC plan. Still
  worth setting up — this workflow doesn't help when the Pi itself is
  unreachable.
- **R2 archive backfill.** The disk archiver is the source of truth now;
  pushing the local `/var/lib/edwtd/archive/...` tree to R2 in batch (once
  R2 creds are available) is a separate one-shot script.
- **Slack-channel-per-component routing.** Right now everything goes to
  `#incidents`. If you want `Data source`-only alerts in a `#data-source`
  channel, that's a per-component filter on the alert route, not this
  workflow.
