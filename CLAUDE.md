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
