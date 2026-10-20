# AGENTS.md

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project Context

Local Next.js dashboard that drafts context-aware YouTube comments and posts them through real Chrome profiles, as viewer-voiced marketing for 운명원 (a love-saju fortune brand). It is the Track 2 take-home for a JG Group AI PM role, due 2026-10-30, and runs only on the owner's Mac because posting needs local Chrome profiles. Scoring drives priorities: real posting 25, context understanding 25, brand lead-in 20, Operating Rules 15, usability 10, design intent 5.

### Tech Stack Summary

| Layer              | Technology                                                                 |
| ------------------ | -------------------------------------------------------------------------- |
| Runtime            | Node >= 25 (local 25.6.1), pnpm 10.26.1                                    |
| Framework          | Next.js 16.4.2 App Router (Turbopack), React 19.3, TypeScript 5 strict     |
| UI                 | Tailwind CSS v4, shadcn/ui `base-nova` on `@base-ui/react`, lucide-react, swr |
| Storage            | `node:sqlite`, single file `data/agent.db`                                 |
| Config             | `config.yaml` parsed with `yaml` + `zod` 4                                  |
| Browser automation | Playwright ^1.64 driving installed Google Chrome, persistent context per profile |
| AI                 | `@anthropic-ai/sdk` ^0.135, model `claude-sonnet-5-5`                      |
| YouTube            | Data API v3 over `fetch`; `yt-dlp` CLI for captions (optional)             |
| Testing / Lint     | vitest 5 (node env); ESLint 9 + `eslint-config-next`                       |

### Repository Layout

```
config.yaml                 operating config: profiles, allowed channels, comment rules, limits
.env.example                env template; real keys go in .env.local (gitignored)
CONTEXT.md                  domain glossary, Korean terms -> English identifiers (canonical)
docs/adr/                   architecture decisions 0001-0004
docs/agents/                issue-tracker, triage-label, and domain-doc conventions for skills
.scratch/marketing-agent/   spec.md + issues/NN-<slug>.md (local issue tracker)
.claude/agents/             project subagents: issue-implementer, issue-reviewer, browser-engineer, prompt-tuner
src/app/                    pages + Route Handlers                  -> src/app/AGENTS.md
src/components/             feature components + shadcn ui/          -> src/app/AGENTS.md
src/lib/                    domain logic, SQLite repos, adapters     -> src/lib/AGENTS.md
tests/                      vitest suites (*.test.ts)
scripts/                    try-login.ts, try-post.ts manual Playwright checks (issues 07-08, planned)
data/                       runtime only, gitignored: agent.db, screenshots/, captions/, profiles/<n>/
```

### Runtime Requirements

- macOS with Google Chrome installed; posting opens visible Chrome windows.
- Node >= 25 for `node:sqlite` (ADR-0004). TODO: no `.nvmrc` or `engines` field pins this yet.
- `yt-dlp` optional. Without it, Drafts fall back to title, description, and top comments.
- TODO: `config.yaml` still holds the placeholder `UC_REPLACE_WITH_TEST_CHANNEL`, which fails `loadConfig()` channel-ID validation. Replace it with the real Test Channel ID before running the app.

## Operational Commands

### Development

```bash
pnpm install
pnpm dev                  # http://localhost:3000; also re-adds the nextjs-agent-rules block above
pnpm build                # production build + typecheck
pnpm start                # serve the production build
```

### Quality and Testing

```bash
pnpm lint                         # eslint (next core-web-vitals + typescript)
pnpm exec tsc --noEmit            # typecheck only
pnpm test                         # vitest run, tests/**/*.test.ts
pnpm test tests/rules.test.ts     # single file
pnpm test:watch
```

### Manual Browser Checks (scripts added by issues 07-08)

```bash
pnpm try:login <n> login                          # open profile n for human Google login
pnpm try:login <n> check                          # print { loggedIn, channelName }
pnpm try:post <profileIndex> <videoId> "<text>"   # Test Channel videos only
```

### Pre-Submission Secret Scan

```bash
git log -p | grep -i api_key
```

## Golden Rules

### Turn Undead (Auto-Created, User-Owned)

Before any non-trivial action, all entry points (Claude Code sessions, subagents, external AI tools reading this file) MUST consult **[TURN_UNDEAD.md](./TURN_UNDEAD.md)** at the project root. The file holds two intensity levels in distinct sections -- apply the matching consultation strategy:

- `## Holy Shout (Hard Rules)` section -- **Halt immediately on violation.** Treat entries as Immutable Constraints.
- `## Holy Word (Soft Guidelines)` section -- **Flag the conflict, then proceed.** Treat entries as Do's/Don'ts.

The init-context skill creates TURN_UNDEAD.md with empty section templates if absent and never modifies its content -- it is user-owned. An empty file (just the two section headers with no rules under either) is valid; the file's existence is the contract. The user fills in rules under the appropriate section over time.

### Behavioral Guidelines (Karpathy, Always Consult)

Before writing, reviewing, or refactoring code, all entry points MUST follow the behavioral guidelines that reduce common LLM coding mistakes -- think before coding, simplicity first, surgical changes, goal-driven execution. They live at the project root and are auto-inlined every session via import:

@KARPATHY_GUIDELINES.md

These guidelines complement, never override, the Immutable Constraints below. The init-context skill creates KARPATHY_GUIDELINES.md from a canonical template if absent and never modifies an existing one. Emit the bare `@KARPATHY_GUIDELINES.md` import line verbatim (not wrapped in a Markdown link) so Claude Code inlines the file's content.

### Immutable Constraints

1. Never post to the five designated channels during development. Real posting (`try:post`, manual runs) targets only videos whose channel ID equals the `test: true` channel in `config.yaml`.
2. Never type, request, or store Google passwords or 2FA codes, and never bypass a CAPTCHA. A human performs login in the Chrome window the app opens.
3. Never commit or print secrets. API keys live only in `.env.local`; the repository is public and only `.env.example` is committed.
4. Never commit `data/`. Start demo recordings from an empty `data/`.
5. Enforce Operating Rules on the server with `checkPostAllowed` before every post, in the order Allowlist -> One Per Video -> Daily Cap. Direct Links get the same allowlist check. Record each Blocked attempt as `posts(status='blocked', reason)`.
6. Read every limit (40-120 chars, Daily Cap, channel list, typing delays) from `config.yaml` only. Never hardcode them.
7. Drafts never present 운명원 as used first-hand; the brand appears only as hearsay. No links, no hashtags.
8. Keep post progress in SQLite (`jobs`), never in module memory, because dev HMR reloads server modules (ADR-0001). Run one post job at a time.
9. Use the built-in `node:sqlite` only; no ORM, no external SQLite driver (ADR-0004).
10. Post through installed Chrome via Playwright `launchPersistentContext` on an app-owned `user-data-dir` per profile (ADR-0002). Keep `playwright` in `serverExternalPackages` and out of client bundles.
11. Keep the `nextjs-agent-rules` block at the top of this file intact; `next dev` rewrites it.

### Do's

- Write every user-facing string (UI labels, error and rule messages) and project doc in Korean. Write code identifiers and commit messages in English.
- Use CONTEXT.md vocabulary in UI text, comments, test names, and issue text. Never use a word listed under `_Avoid_`.
- Read the ADRs that touch an area before changing it. State any contradiction explicitly instead of overriding silently.
- Work test-first: failing vitest test -> minimal implementation -> full suite green.
- Keep decision logic in pure functions and inject I/O into adapters so `pnpm test` stays offline.
- Use pnpm for every package operation.
- Check current docs via context7 for Next.js, Playwright, shadcn, and the Anthropic SDK instead of relying on memory.
- Route issue work to the subagent named in the issue's `Agent:` line, with the model in its `Model:` line.

### Don'ts

- Do not push from a subagent. The main session pushes after `issue-reviewer` approves.
- Do not create files or refactor outside the current issue's scope; propose it under the issue's `## Comments`.
- Do not change an interface an issue specifies (names, signatures, file paths); later issues depend on it.
- Do not build out-of-scope items: web deploy, multi-user, `?lc=` comment links, multi-draft comparison UI, a separate worker process, Rising Video (deferred).
- Do not use npm, yarn, or bun.
- Do not read `.env.local` or echo key values.
- Do not fake-pass a real-key verification step; skip it and note the skip in the issue.

## Standards & References

### Coding Conventions

- TypeScript strict. Path alias `@/*` -> `src/*`. Inside `src/lib/`, import siblings relatively (`./paths`); app code and tests import `@/lib/...`.
- Node built-ins use the `node:` prefix. Type-only imports use `import type`.
- No Prettier config. Hand-written code in `src/lib/` and `tests/` uses single quotes, no semicolons, and compact one-line helpers. Generated files (create-next-app, shadcn) keep double quotes and semicolons. Match the file you edit.
- Module files lowercase (`rules.ts`, `rotation.ts`); feature components PascalCase (`VideoList.tsx`); tests `tests/<module>.test.ts`.
- Reason and violation codes are snake_case string-literal unions (`not_allowed_channel`, `too_short`). SQLite columns are snake_case; TS row types mirror them (`PostRow`, `JobRow`).
- ESLint: `eslint-config-next` core-web-vitals + typescript, run via `pnpm lint`.

### Issue Workflow

- Tracker: `.scratch/marketing-agent/issues/NN-<slug>.md`; spec: `.scratch/marketing-agent/spec.md`; order and blockers: spec section 17.
- An issue is unblocked when every issue in its `Blocked by:` line is `resolved`. Set `Status: claimed` before work.
- Finish: full `pnpm test` green -> commit with the issue's message -> `Status: resolved` + one paragraph under `## Comments` (what was verified, deviations, open questions).
- Review: `issue-reviewer` checks the commit range against the issue, spec, CONTEXT.md, and ADRs. REQUEST CHANGES returns to the same implementer.
- Conventions: [docs/agents/issue-tracker.md](./docs/agents/issue-tracker.md); labels: [docs/agents/triage-labels.md](./docs/agents/triage-labels.md).

### Git Strategy

- GitHub `luisjang1206/marketing-ai-agent`, single branch `main`. No CI, no git hooks.
- Conventional Commits in plain English (`feat:`, `fix:`, `chore:`, `docs:`). Body only when the why is not obvious. End with the session's `Co-Authored-By` trailer.

### Maintenance Policy

When rules in any AGENTS.md diverge from actual code behavior, update the AGENTS.md to reflect reality and flag the divergence in a commit message.

## Environment Variables

`.env.local` (gitignored; template `.env.example`):

- `YOUTUBE_API_KEY` -- YouTube Data API v3 key for video lists, Direct Link channel checks, view counts, and top comments. Free quota 10,000 units/day; one full list fetch costs about 12.
- `ANTHROPIC_API_KEY` -- Anthropic Messages API key for Draft generation.
- `ANTHROPIC_MODEL` -- optional; defaults to `claude-sonnet-5-5`.
- `ANTHROPIC_BASE_URL` -- not app config. The SDK reads it from the shell, so the app passes `baseURL` explicitly and only `.env.local` settings apply.

Non-secret settings live in `config.yaml`: `profiles`, `channels` (exactly one with `test: true`), `comment.{min_chars,max_chars,brand,banned_phrases,brand_phrases}`, `limits.daily_max_comments`, `fetch.per_channel`, `typing.{min_delay_ms,max_delay_ms}`.

## Domain Glossary

[CONTEXT.md](./CONTEXT.md) is canonical. This table maps core terms to code identifiers.

| Term (KO)       | Identifier      | Meaning                                                                    |
| --------------- | --------------- | -------------------------------------------------------------------------- |
| 영상            | Video           | Target YouTube video, from the list or a Direct Link                       |
| 허용 채널       | Allowed Channel | 5 designated channels + 1 Test Channel, by ID in `config.yaml`             |
| 테스트 채널     | Test Channel    | Owner's channel (`test: true`); the only posting target during development |
| 직접 입력       | Direct Link     | Pasted video URL; gets the same allowlist check                            |
| 고민 한 줄      | Concern         | One sentence naming the love concern the video covers                      |
| 근거 장면       | Evidence        | Concrete scene or line from the video that the Draft cites                 |
| 댓글 초안       | Draft           | Unposted comment; must pass Draft Rules before posting                     |
| 검증 규칙       | Draft Rules     | 40-120 chars, cites the video, no links, hashtags, or first-hand brand use |
| 시청자 페르소나 | Viewer Persona  | The Draft's speaker: a viewer, never a 운명원 insider                      |
| 프로필          | Profile         | App-owned Chrome profile for one Google account (유튜브1-3, ids p1-p3)     |
| 자동 배정       | Rotation        | Picks the next logged-in profile after the last one used                   |
| 게시            | Post            | Open profile, type char by char, submit, verify own comment                |
| 진행 상태       | Progress        | Job state: opening_profile, typing, posted, verified, failed               |
| 실패 사유       | Failure Reason  | not_logged_in, comments_disabled, element_not_found, timeout, unknown      |
| 게시 기록       | Post Log        | One row per attempt: success, failed, or blocked                           |
| 운영 규칙       | Operating Rules | Allowlist, One Per Video, Daily Cap                                        |
| 차단            | Blocked         | Stopped by Operating Rules before starting; distinct from failed           |
| 하루 상한       | Daily Cap       | Successful posts per local date across all profiles; default 10            |
| 뜨기 직전 영상  | Rising Video    | Deferred bonus feature; draft only, never posted                           |

## Context Map (Action-Based Routing)

- **[src/lib/AGENTS.md](./src/lib/AGENTS.md)** -- Editing rules, repos, the SQLite schema, YouTube/caption/draft adapters, Playwright posting, the job runner, or tests.
- **[src/app/AGENTS.md](./src/app/AGENTS.md)** -- Editing pages, Route Handlers, `src/components/`, shadcn primitives, or polling.
- **[CONTEXT.md](./CONTEXT.md)** -- Naming anything user-visible or any domain identifier.
- **[docs/adr/](./docs/adr/)** -- Touching framework choice, browser launch, YouTube data sources, or storage.
- **[.scratch/marketing-agent/spec.md](./.scratch/marketing-agent/spec.md)** -- Needing the full contract: data model, pipelines, UI, review focus, risks.
- **[.scratch/marketing-agent/issues/](./.scratch/marketing-agent/issues/)** -- Picking up, implementing, or reviewing an issue.
- **[docs/agents/issue-tracker.md](./docs/agents/issue-tracker.md)** -- Updating an issue's Status line or Comments.
- **[.claude/agents/](./.claude/agents/)** -- Choosing or dispatching a project subagent.
- **[TURN_UNDEAD.md](./TURN_UNDEAD.md)** -- Before any non-trivial action (user-owned rules).
- **[KARPATHY_GUIDELINES.md](./KARPATHY_GUIDELINES.md)** -- Before writing, reviewing, or refactoring code.

<!-- custom -->
<!-- Add project-specific notes below. This block is preserved across regeneration. -->
<!-- /custom -->
