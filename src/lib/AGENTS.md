# AGENTS.md -- src/lib

## Module Context

Server-side core of the dashboard. Owns every Operating Rule, the SQLite data layer, and thin adapters to external systems (YouTube Data API, yt-dlp, Anthropic, Playwright + Chrome).

- Upstream callers: Route Handlers in `src/app/api/**` (issue 09), standalone scripts in `scripts/` (issues 07-08), client components (pure modules only).
- Downstream: `config.yaml`, `data/agent.db`, `data/{screenshots,captions,profiles}/`, YouTube, Anthropic API, installed Google Chrome.
- Spec: `.scratch/marketing-agent/spec.md` sections 3-10. Decisions: `docs/adr/0001`-`0004`.

### Layout

```
src/lib/
  config.ts            loadConfig(), parseConfig(), profilesOf(), allowedChannelIds(), testChannelIds()
  paths.ts             dataDir(), dbPath(), profileDir(n), screenshotDir(), captionDir(), ensureDataDirs()
  db.ts                openDb(file), getDb() -- schema + globalThis singleton
  rules.ts             checkPostAllowed()                         -- pure
  utils.ts             cn re-export for UI
  services.ts          services() -- cfg/db/youtube/llm/model/today singleton for Route Handlers (needs both API keys)
  api-types.ts         response types shared with the UI (type-only imports)
  repo/                videos, captions, drafts, posts, jobs, profiles -- SQL only
  browser/rotation.ts  pickProfile()                              -- pure
  youtube/             url.ts (pure), api.ts, captions.ts         -- issues 04, 05 (planned)
  youtube/map.ts       toRow(meta, source) -- VideoMeta -> VideoRow (issue 09)
  youtube/rising.ts    assessRising(), publishedAfterIso() -- pure (issue 15)
  repo/rising.ts       insertRisingSearch(), latestRisingSearch(), listRisingCandidates() (issue 15)
  draft/               prompt.ts, validate.ts (pure), generate.ts -- issue 06 (planned)
  browser/             launch.ts, profiles.ts, poster.ts          -- issues 07, 08 (planned)
  jobs/runner.ts       startPostJob(), runPostJob()               -- issue 08 (planned)
  client/api.ts        fetch wrapper + swr keys (client only)     -- issue 10
```

## Tech Stack & Constraints

- Node >= 25 (local v25.6.1). `node:sqlite` `DatabaseSync` is synchronous. No ORM, no better-sqlite3 (ADR-0004).
- `zod` 4 + `yaml` parse `config.yaml`. `@anthropic-ai/sdk` ^0.135 generates Drafts.
- `playwright` ^1.64 drives installed Google Chrome (`channel: 'chrome'`). Never bundled Chromium, never the default Chrome profile, never CDP attach (ADR-0002).
- YouTube Data API v3 over `fetch` with `YOUTUBE_API_KEY`. Captions via the `yt-dlp` CLI as a child process; yt-dlp is optional (ADR-0003).
- Pure modules (no I/O): `rules.ts`, `browser/rotation.ts`, `youtube/url.ts`, `draft/validate.ts`, `youtube/rising.ts`. Client components import `rules.ts` to pre-disable the post button (issue 10), so these files import nothing from `node:*`, `db`, `repo`, or `playwright`.
- Everything else is server-only.

## Implementation Patterns

### Pure Rules

Return a discriminated-union verdict; never throw for a rule failure. Reason codes are snake_case string literals with Korean messages in a map beside them.

```ts
export type RuleVerdict = { allowed: true } | { allowed: false; reason: RuleReason; message: string }

export function checkPostAllowed(i: RuleInput): RuleVerdict {
  const fail = (reason: RuleReason): RuleVerdict => ({ allowed: false, reason, message: RULE_MESSAGES[reason](i) })
  if (!i.allowedChannelIds.includes(i.videoChannelId)) return fail('not_allowed_channel')
  if (i.alreadyPosted) return fail('already_posted')
  if (i.successCountToday >= i.dailyMax) return fail('daily_cap_reached')
  return { allowed: true }
}
```

- Order is fixed: Allowlist -> One Per Video -> Daily Cap. Return the first violation only.
- Inputs are plain values (IDs, counts, booleans). Callers query repos and pass results in.

### Repositories

- Every repo function takes `db: DatabaseSync` as its first argument. No module-level db access in `repo/`.
- Use `db.prepare(...)` with `?` placeholders for values. Interpolate only fixed column-name lists, never user data.
- Convert at the repo boundary: SQLite INTEGER booleans -> `boolean` (`logged_in`, `valid`), JSON TEXT -> arrays (`drafts.violations`).
- Timestamps default to `datetime('now','localtime')`. Daily Cap takes the local date as an injected string.

```ts
export function hasSuccessForVideo(db: DatabaseSync, videoId: string): boolean {
  return !!db.prepare(`SELECT 1 FROM posts WHERE video_id=? AND status='success' LIMIT 1`).get(videoId)
}
export function successCountToday(db: DatabaseSync, today: string): number { /* date(created_at)=? */ }
```

- Schema lives only in `db.ts` (`CREATE TABLE IF NOT EXISTS`). Status and state columns are CHECK-constrained; change the CHECK list and the TS union together.
- `getDb()` caches on `globalThis.__agentDb` so dev HMR reuses one connection. Tests call `openDb(':memory:')`.

### Adapters (External I/O)

- Keep adapters thin: typed input -> typed output. Inject the I/O primitive so tests replace it whole:
  - `createYoutubeApi(apiKey, fetchImpl = fetch)` (issue 04)
  - `fetchCaptions(videoId, { outDir, exec })` (issue 05)
  - LLM client for `generateDraft` (issue 06), `post` function for the job runner (issue 08)
- Defined fallbacks do not throw: missing yt-dlp (`ENOENT`) or no subtitles -> `{ text: '', source: 'none' }`; YouTube 404 on an empty upload playlist -> skip that channel.
- Paths come from `paths.ts`. Never hardcode `data/...`.
- Limits come from `loadConfig()`. Never hardcode 40/120 chars, 10 per day, channel IDs, or typing delays.

### Drafts (issue 06, owner: prompt-tuner)

- Force the output shape with tool use: `{ concern, evidence, text }`.
- Model from `ANTHROPIC_MODEL`, default `claude-sonnet-5-5`. Pass `baseURL` explicitly so a shell `ANTHROPIC_BASE_URL` cannot redirect calls.
- `validateDraft` violation codes: `too_short`, `too_long`, `has_link`, `has_hashtag`, `banned_phrase`, `missing_brand`. Count characters with `[...text].length`.
- On violation, retry with the violation list, at most 2 extra attempts. Store the result with `valid` and `violations`; the newest `drafts` row per video is the current Draft.
- 운명원 appears once, in the latter half, as hearsay (variants of `comment.brand_phrases`). Never as first-hand use.
- Load the `claude-api` skill before editing the Anthropic adapter.

### Browser (issues 07-08, owner: browser-engineer)

- Launch: `launchPersistentContext(profileDir(n), { channel: 'chrome', headless: false, locale: 'ko-KR', viewport: null })`.
- Keep every selector in the `SELECTORS` / `PROFILE_SELECTORS` constants. On DOM breakage, edit only those and log the changed selector + date in the issue `## Comments`.
- Type one character at a time with a random delay in `[typing.min_delay_ms, typing.max_delay_ms]`.
- Job states: `queued -> opening_profile -> typing -> posted -> verified`, or `failed`. Write every transition with `updateJob`; never hold progress in memory.
- Failure Reasons: `not_logged_in`, `comments_disabled`, `element_not_found`, `timeout`, `unknown`.
- Capture a screenshot on every failure path and close the context in `finally`.
- One job at a time: `activeJob(db)` present -> 409 `busy`. A profile directory cannot be opened twice.
- If launch options (`channel`, `args`, `ignoreDefaultArgs`) change, add the reason to ADR-0002 Consequences.

## Testing Strategy

- Runner: vitest 5, `environment: 'node'`, files `tests/**/*.test.ts` at the repo root (not colocated). Import via `@/lib/...`.
- Repo tests: fresh `openDb(':memory:')` in `beforeEach`. Insert rows with explicit `created_at` to test local-midnight boundaries.
- Pure modules: one rule per `it`; assert first-violation ordering.
- Adapters: inject fakes for `fetch`, exec, LLM client, and `post`. Never hit the network in `pnpm test`.
- Real-key checks: guard with `it.skipIf(!process.env.YOUTUBE_API_KEY)`. Never fake a pass when the key is absent.
- Playwright paths: manual only, via `pnpm try:login` / `pnpm try:post` on the Test Channel.

```bash
pnpm test                       # full suite
pnpm test tests/repo.test.ts    # one file
```

## Local Golden Rules

- Keep the four pure modules free of I/O and server-only imports.
- Follow issue interfaces verbatim (names, signatures, file paths); later issues depend on them.
- Post only to Test Channel videos during development: run `try-post` only when the video's channel ID equals the `test: true` channel in `config.yaml`. A posted video is consumed by One Per Video; ask the user for a new test video ID.
- Never enter passwords or 2FA codes and never solve CAPTCHAs. Open the login window and hand off to the user.
- Only `status='success'` rows count toward Daily Cap and One Per Video. A failed post may be retried.
- Record Blocked attempts as `posts(status='blocked', reason)`; keep them distinct from `failed`.

<!-- custom -->
<!-- Add project-specific notes below. This block is preserved across regeneration. -->
<!-- /custom -->
