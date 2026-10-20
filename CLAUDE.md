# CLAUDE.md

Local Next.js dashboard that drafts context-aware YouTube comments for 운명원 and posts them through real Chrome profiles under code-enforced Operating Rules.

For architecture, module rules, coding conventions, and tech stack details, see **[AGENTS.md](./AGENTS.md)** and its per-module children. Read AGENTS.md **Golden Rules** before any non-trivial task (Turn Undead, Immutable Constraints, Do's/Don'ts).

## Common Commands

```bash
pnpm install
pnpm dev                          # http://localhost:3000
pnpm build                        # production build + typecheck
pnpm lint                         # eslint (next core-web-vitals + typescript)
pnpm exec tsc --noEmit            # typecheck only
pnpm test                         # vitest run, tests/**/*.test.ts
pnpm test tests/rules.test.ts     # single file
pnpm test:watch
pnpm reset:data                   # before demo recording, dev server off; keeps data/profiles (Google logins)
# scripts added by issues 07-08; Test Channel videos only
pnpm try:login <n> login|check
pnpm try:post <profileIndex> <videoId> "<text>"
```

## Critical Imports

```ts
import { loadConfig, profilesOf, allowedChannelIds } from '@/lib/config' // config.yaml -> AppConfig (zod)
import { getDb, openDb } from '@/lib/db'          // app singleton; openDb(':memory:') in tests
import type { DatabaseSync } from 'node:sqlite'   // every repo fn takes db first
import { checkPostAllowed } from '@/lib/rules'    // pure; safe in client components
import { cn } from '@/lib/utils'                  // class merge for UI
```

## Git

- **VCS:** GitHub (`luisjang1206/marketing-ai-agent`), hosted
- **Branch flow:** single branch `main`; no CI
- **Commits:** Conventional Commits, plain English, `Co-Authored-By` trailer (convention only, not enforced)
- **Git hooks:** none
- **Push:** main session only, after `issue-reviewer` APPROVE

## Agent Discovery

Project subagents (4) live in [.claude/agents/](.claude/agents/). Ownership, model override, and the orchestration loop are in the custom block below.

## Env Var Names

```
# .env.local (template: .env.example)
YOUTUBE_API_KEY
ANTHROPIC_API_KEY
ANTHROPIC_MODEL      # optional
```

<!-- custom -->
<!-- Add project-specific notes below. This block is preserved across regeneration. -->

## Agent skills

### Issue tracker

Local markdown: issues live as files under `.scratch/<feature>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), used as-is. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Subagents (project-level, `.claude/agents/`)

| Agent | Default model | Owns |
|---|---|---|
| `issue-implementer` | opus | issues 01–05, 09–11: one issue file, TDD, commit (no push) |
| `issue-reviewer` | opus | review one issue's commits vs issue/spec/CONTEXT.md/ADR; read-only + tests |
| `browser-engineer` | opus | issues 07–08 and any Playwright/YouTube DOM breakage; test channel only |
| `prompt-tuner` | opus | issue 06 and any draft prompt/validation tuning |

**Model override rule.** Every agent file says `model: opus`. Each issue file carries `Agent:` and `Model:` lines. When dispatching with the Agent tool, pass `model: "sonnet"` for issues marked `Model: sonnet` (mechanical coding fully specified by the issue); omit the override for `Model: opus`. The reviewer always runs on opus.

**Orchestration loop (main session).** For each unblocked issue: dispatch its agent → dispatch `issue-reviewer` with the commit range → if REQUEST CHANGES, send findings back to the same implementer → on APPROVE, `git push`. The main session never implements issues itself; it manages order, asks the user for keys/logins/test video, and pushes.

<!-- /custom -->
