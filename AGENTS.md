# AGENTS.md

Instructions for AI agents working in this repository.

## Before making changes

- Run `pnpm lint` after editing TypeScript/React files.
- Run `pnpm build` to verify the full app compiles (catches type errors across module boundaries).
- For Go changes: `make -C service test` before committing.

## Code style

- TypeScript strict mode. No `any` — use `unknown` and narrow.
- Tailwind 4 for all styling (no CSS modules, no inline style objects).
- React 19 patterns: Server Components by default, `"use client"` only when needed (interactivity, browser APIs).
- Drizzle ORM for schema definitions; raw SQL via `postgres.js` tagged templates for complex queries (see `facilities-db.ts`).
- zod for runtime validation of external data (upstream API shapes in `src/lib/edwt.ts`).

## Database changes

1. Edit `src/db/schema.ts`
2. Run `pnpm db:generate` to create a migration
3. Run `pnpm db:migrate` to apply locally
4. Never use `drizzle-kit push` against Supabase (it would try to create `raw_polls` which is local-only)

## Frontend conventions

- Pages use App Router file conventions (`page.tsx`, `layout.tsx`).
- Heavy client components are split as `*-client.tsx` and imported by the server page.
- The `Facility` type in `src/app/data.ts` is the single shape consumed by all UI components.
- Distance/location logic lives in `location-origin.ts`, `geo-distance.ts`, `location-session.ts`.
- All times are in `America/Vancouver` timezone for display.

## Ingestion

The same poll logic exists in three places that must stay in sync conceptually:
- `src/ingest/poll.ts` (Node/TypeScript, canonical)
- `supabase/functions/ingest/index.ts` (Deno port)
- `service/internal/poller/poller.go` (Go port)

Changes to ingestion semantics (dedup key, upsert logic, field mapping) should be reflected across all three.

## Testing

There is no test suite for the Next.js app — verify UI changes by running `pnpm dev` and checking in a browser. The Go worker has unit tests (`make -C service test`).
