---
name: init-context
description: 'Generate complementary CLAUDE.md + AGENTS.md hierarchy for AI context. Use when bootstrapping a new project, refreshing stale context files, or adding nested AGENTS.md for a new module. Covers project discovery, file generation, and verification.'
disable-model-invocation: true
argument-hint: '[all | agents | claude | <path> | --dry-run]'
---

# Role

You are a **Principal Architect for AI Context & Governance**. You analyze the user's project and produce a complementary pair of context files:

- **CLAUDE.md** -- Slim operational reference (~80 lines), auto-loaded every session.
- **AGENTS.md hierarchy** -- Detailed governance, architecture, and module-specific rules.

These two layers form a single system. CLAUDE.md is the "quick card"; AGENTS.md is the "full manual". They must never duplicate each other except where explicitly permitted by the Complementarity Rules in `claude-prompt.md`.

# Scope

Parse `$ARGUMENTS` to determine scope:

| Argument         | Behavior                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------- |
| (empty) or `all` | Run all phases (Discovery -> Turn Undead -> Karpathy -> AGENTS.md -> CLAUDE.md -> Verify) |
| `agents`         | Phase 0 + Phase 0.7 (Turn Undead) + Phase 0.8 (Karpathy) + Phase 1 (AGENTS.md hierarchy)  |
| `claude`         | Phase 0 + Phase 2 only (CLAUDE.md)                                                        |
| `turn-undead`    | Phase 0 + Phase 0.7 only (ensure TURN_UNDEAD.md exists)                                   |
| `<path>`         | Phase 0 (scoped) + generate/refresh nested AGENTS.md at given path                        |
| `--dry-run`      | Phase 0 only + print planned file list and section outlines, no files written             |

# Workflow

## Phase 0: Discovery

Perform comprehensive project analysis before generating any file. Gather **facts only** -- no assumptions.

**Token budget guidance:** For large monorepos (5+ workspace members), use the Agent tool with `subagent_type=Explore` to parallelize structure/code scanning (steps 0.1-0.3). This keeps the main context window lean. For small projects, inline Glob/Read/Grep is fine.

### 0.1 Structure Scan

Read and analyze (use Glob + Read, not Bash):

- `package.json` (root + all workspace members) -- deps, scripts, engines
- `tsconfig.json` / `tsconfig.*.json` -- compiler options, paths aliases
- Framework configs: `next.config.*`, `vite.config.*`, `drizzle.config.*`, `tailwind.config.*`, `postcss.config.*`
- `.env.example` or `.env.local.example` -- env var inventory
- Lockfile presence: `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `bun.lockb`
- Monorepo config: `turbo.json`, `pnpm-workspace.yaml`, `lerna.json`
- Runtime version pinning: `.nvmrc`, `.node-version`, `.tool-versions`, `mise.toml`
- Docker / Infra: `Dockerfile`, `docker-compose*.yml`, `compose*.yml`
- CI/CD: `.gitlab-ci.yml`, `.github/workflows/`, `Jenkinsfile`
- MCP config: `.mcp.json` (available MCP servers for Claude Code environment)

### 0.2 Documentation Scan

Read existing context sources (skip if absent):

- `README.md` (root + workspace members)
- `.cursor/rules/`, `.github/copilot-instructions.md`, `.windsurfrules`
- Existing `CLAUDE.md` and any `AGENTS.md` files
- `.claude/` directory: skills, agents, hooks, plugins, `settings.json`
- `CONTRIBUTING.md`, `docs/` folder
- **Turn Undead:** `TURN_UNDEAD.md` -- only note presence and capture file size/hash for the no-mutation check in Phase 3. Do NOT analyze, summarize, or modify its contents. It is user-owned.
- **Karpathy Guidelines:** `KARPATHY_GUIDELINES.md` -- only note presence (existence gate for Phase 0.8). Do NOT modify an existing one.

### 0.3 Code Pattern Inference

Use Grep + Read on a sample of source files (max 10-15 files across the project).

**Sampling priority** (for consistency across runs): entry points (`main.ts`, `app.ts`, `index.ts`) > route handlers / controllers > services / use-cases > repositories / data access > utilities. Always analyze architecturally significant files first.

Patterns to detect:

- Import patterns: path aliases, barrel exports, relative vs absolute
- Naming conventions: file names, component names, function names
- State management: Redux, Zustand, Context, TanStack Query, signals
- Styling: CSS Modules, Tailwind, styled-components, CSS-in-JS
- Data access: ORM usage, client patterns, API route conventions
- Testing patterns: test file locations, naming, frameworks used

### 0.4 Git Analysis

```bash
git log --oneline -20                    # Recent commit style
git branch -a | head -20                 # Branch strategy
git remote -v                            # Remote setup
```

Detect: main branch name, commit convention (Conventional Commits?), branch naming pattern.

### 0.5 Existing Context Audit

If CLAUDE.md or AGENTS.md already exist:

1. Read them fully.
2. Identify `<!-- custom -->` ... `<!-- /custom -->` marker blocks -- contents inside these markers MUST be preserved verbatim in regenerated files.
3. Note their current line counts for the verification phase.
4. Custom block lines count toward the line cap. If custom blocks push the file over limits, trim generated content (never custom content) to compensate.

### 0.6 Boundary Detection

Identify nested AGENTS.md candidates by checking for:

- **Dependency Boundary:** Separate `package.json` / `requirements.txt` / `Cargo.toml`
- **Framework Boundary:** Tech stack transition points (e.g., Next.js app vs Deno edge functions)
- **Logical Boundary:** High-density business logic modules, separate deployment targets

Record each boundary as: `{ path, type, reason, key_deps }`.

## Phase 0.7: Turn Undead Pre-flight (TURN_UNDEAD.md)

Run this **before** any AGENTS.md or CLAUDE.md generation. AGENTS.md will link to TURN_UNDEAD.md in its Golden Rules subsection, so the file must exist before Phase 3 link integrity passes.

**TURN_UNDEAD.md** is the user-owned rule layer at the project root. The D&D metaphor: Turn Undead is a cleric spell that drives away undead -- here, it drives away the "undead" of bad coding behaviors. The single file holds two intensity levels (`Holy Shout` for hard rules, `Holy Word` for soft guidelines) so Claude can apply different consultation strategies per section without managing two files.

**File structure (one file, two strength sections):**

| Section                          | Purpose                                        | Violation behavior            |
| -------------------------------- | ---------------------------------------------- | ----------------------------- |
| `## Holy Shout (Hard Rules)`     | Absolute prohibitions and mandatory invariants | Halt immediately              |
| `## Holy Word (Soft Guidelines)` | Recommended conventions and preferences        | Flag and continue with notice |

**Generation rules:**

1. **Always ensure `./TURN_UNDEAD.md` exists** at the project root. If absent, create it with the minimal template below.
2. **NEVER overwrite or modify an existing TURN_UNDEAD.md** -- not even one byte. It is owned by the user. Re-running `/init-context` for any reason must leave it byte-identical. Use `test -f` (Bash) before any Write call. Never use Edit, MultiEdit, or any other mutation tool on this file.
3. The minimal template intentionally has no rules content under either section -- the user fills them in over time. An empty TURN_UNDEAD.md (just headers + descriptions) is valid; the file's existence is the contract.

**TURN_UNDEAD.md initial template (only when file is absent):**

```markdown
# TURN UNDEAD

User-owned rule layer. Add rules under the section that matches enforcement strength. The init-context skill ensures this file exists; everything below is yours to fill in.

## Holy Shout (Hard Rules)

> Halt immediately on violation. Treat entries here as Immutable Constraints.

<!-- Add absolute prohibitions and mandatory invariants below. -->

## Holy Word (Soft Guidelines)

> Flag the conflict, then proceed. Treat entries here as Do's/Don'ts.

<!-- Add recommended conventions and preferences below. -->
```

**Idempotency check (mandatory):**

Before this phase starts, capture file size + first-line hash of an existing TURN_UNDEAD.md (this snapshot was already taken in Phase 0.2 -- reuse it). After this phase completes, verify size + hash are unchanged. If TURN_UNDEAD.md existed before this phase and its size/hash changed, that is a critical bug -- abort the run and report.

## Phase 0.8: Karpathy Guidelines Pre-flight (KARPATHY_GUIDELINES.md)

Run this **before** any AGENTS.md generation. The root AGENTS.md Golden Rules section imports `@KARPATHY_GUIDELINES.md`, so the file must exist before Phase 3 link integrity passes.

**KARPATHY_GUIDELINES.md** holds the behavioral guidelines that reduce common LLM coding mistakes (think before coding, simplicity first, surgical changes, goal-driven execution). It is the canonical companion to the user-owned Turn Undead layer: Turn Undead is what _this_ project forbids/prefers; Karpathy is how to write code well in general.

**Generation rules:**

1. **Always ensure `./KARPATHY_GUIDELINES.md` exists** at the project root. Use `test -f` (Bash) before any Write call.
2. If absent, create it by copying the canonical template bundled with this skill at `assets/KARPATHY_GUIDELINES.template.md` verbatim.
3. **NEVER overwrite or modify an existing KARPATHY_GUIDELINES.md.** Projects may merge in their own guidance (the template says so on line 1), so a present file is authoritative -- leave it byte-identical. Never use Edit/MultiEdit on it.

## Phase 1: Generate AGENTS.md Hierarchy

Reference: `agents-prompt.md` for all section templates and rules.

Order of operations:

1. Generate root `./AGENTS.md` first. Its **Golden Rules** section MUST open with two mandatory subsections in this order, both before Immutable Constraints:
   - `### Turn Undead (Auto-Created, User-Owned)` -- links to `./TURN_UNDEAD.md` and names both internal sections (`Holy Shout (Hard Rules)` -- halt; `Holy Word (Soft Guidelines)` -- flag and proceed) so consumers know which strategy applies to which section. This is the canonical pointer for all entry points -- CLAUDE.md does not duplicate it.
   - `### Behavioral Guidelines (Karpathy, Always Consult)` -- emits the bare `@KARPATHY_GUIDELINES.md` import line verbatim (not wrapped in a Markdown link) so Claude Code auto-inlines the guidelines every session.
     See `agents-prompt.md` section 3 for the exact subsection templates.
2. Generate each nested `AGENTS.md` in dependency order (leaves first, then parents that reference them).
3. Ensure the root Context Map links to every nested file.

For each file:

- If existing file has `<!-- custom -->` blocks, preserve them at their original positions.
- If existing file has NO custom markers, warn the user before overwriting: "Existing {path} has no custom markers. Contents will be replaced."
- Append a custom marker block at the end of every generated file:

```markdown
<!-- custom -->
<!-- Add project-specific notes below. This block is preserved across regeneration. -->
<!-- /custom -->
```

## Phase 2: Generate CLAUDE.md

Reference: `claude-prompt.md` for section templates, line budget, and complementarity rules.

1. Read the AGENTS.md generated in Phase 1 (or existing if scope is `claude` only). Confirm its Golden Rules section starts with the `### Turn Undead` subsection -- that is the canonical pointer to TURN_UNDEAD.md.
2. Extract only what belongs in CLAUDE.md per the complementarity contract. CLAUDE.md does NOT get its own Turn Undead section; the AGENTS.md pointer paragraph (with "Turn Undead" in its parenthetical) is the only signal CLAUDE.md needs.
3. Generate slim CLAUDE.md (~80 lines).
4. Preserve any `<!-- custom -->` blocks from existing CLAUDE.md.
5. Append custom marker block if not already present.

## Phase 3: Verification

Run these checks using the specified tools and report results:

1. **Line Count:** Count lines of each generated file (use Bash `wc -l`). CLAUDE.md <= 100 lines. Each AGENTS.md <= 500 lines.
2. **Complementarity Check:** Extract `^## ` headings from both CLAUDE.md and root AGENTS.md using Grep. Diff the two heading lists. Only `## Common Commands` / `## Operational Commands` may overlap. Flag any other heading that appears in both files.
3. **Link Integrity:** For each path in AGENTS.md Context Map, use Glob to confirm the target file exists. Also confirm both Golden Rules imports resolve: `TURN_UNDEAD.md` (Turn Undead subsection) and `KARPATHY_GUIDELINES.md` (Behavioral Guidelines subsection).
4. **Custom Block Integrity:** If input files had `<!-- custom -->` blocks, use Grep to confirm `<!-- custom -->` and `<!-- /custom -->` appear in each output file.
5. **No Emojis:** Use Grep with pattern `[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{FE00}-\x{FE0F}\x{200D}\x{20E3}\x{E0020}-\x{E007F}]` on generated files (covers Miscellaneous Symbols, Dingbats, Variation Selectors, ZWJ, and extended emoji blocks). Visually scan as fallback.
6. **Turn Undead Existence:** Confirm `TURN_UNDEAD.md` exists at the project root (use Bash `test -f`).
7. **Turn Undead Immutability:** Compare the size + first-line hash captured in Phase 0.2 (pre-run snapshot) against the current state for TURN_UNDEAD.md if it existed before the run. They must match exactly. A newly created TURN_UNDEAD.md (no pre-snapshot) automatically passes.
8. **AGENTS.md Turn Undead Subsection:** Use Grep on the root AGENTS.md to confirm a `### Turn Undead` subsection exists inside `## Golden Rules` and references `TURN_UNDEAD.md` along with both internal section names (`Holy Shout (Hard Rules)` and `Holy Word (Soft Guidelines)`). This subsection is the single canonical pointer; without it, subagents and other entry points cannot find the user-owned rule layer.
9. **CLAUDE.md AGENTS.md Pointer Mentions Turn Undead:** Use Grep on the generated CLAUDE.md to confirm the AGENTS.md pointer paragraph's parenthetical includes the literal phrase "Turn Undead" -- this is the only signal CLAUDE.md provides about the user-owned rule layer.
10. **Karpathy Guidelines Existence:** Confirm `KARPATHY_GUIDELINES.md` exists at the project root (use Bash `test -f`).
11. **AGENTS.md Karpathy Import:** Use Grep on the root AGENTS.md to confirm a `### Behavioral Guidelines (Karpathy` subsection exists inside `## Golden Rules` and contains a bare `@KARPATHY_GUIDELINES.md` import line (pattern `^@KARPATHY_GUIDELINES\.md$`). A Markdown-link form (`[...](...)`) fails this check because Claude Code only inlines the bare `@path` token.

Report format:

```
Verification Results:
- CLAUDE.md: {n} lines [PASS/FAIL]
- AGENTS.md (root): {n} lines [PASS/FAIL]
- AGENTS.md (nested): {path}: {n} lines [PASS/FAIL] (for each)
- Complementarity: [PASS/FAIL] {details if fail}
- Link Integrity: [PASS/FAIL] {broken links if fail}
- Custom Blocks: [PASS/FAIL] {details if fail}
- Emoji Check: [PASS/FAIL]
- Turn Undead Existence: TURN_UNDEAD.md [PASS/FAIL]
- Turn Undead Immutability: [PASS/FAIL/N/A] {if FAIL, note size/hash drift}
- AGENTS.md Turn Undead Subsection: [PASS/FAIL] {missing or malformed if fail}
- CLAUDE.md AGENTS.md Pointer Mentions Turn Undead: [PASS/FAIL]
- Karpathy Guidelines Existence: KARPATHY_GUIDELINES.md [PASS/FAIL]
- AGENTS.md Karpathy Import: [PASS/FAIL] {missing or link-wrapped if fail}
```

# Execution Rules

1. **Direct Execution:** Do not ask "should I create this file?" -- generate immediately. Exception: `--dry-run` prints the planned output structure and stops.
2. **Markdown Only:** Output valid Markdown. No prose explanations inside the generated files.
3. **Korean Content:** If the project's user-facing strings are in Korean, write AGENTS.md rule descriptions in English but note the Korean-string requirement in Golden Rules.
4. **Facts Over Assumptions:** Every rule you write must be traceable to a discovery finding. If uncertain, add a `TODO:` comment rather than guessing.
5. **Graceful Degradation:** If a discovery step fails (e.g., no git history, missing config files), log what was skipped and continue with remaining phases. Never abort entirely because one optional scan failed.
6. **Turn Undead Is Sacred:** `TURN_UNDEAD.md` is user-owned. Create it with the minimal template ONLY when absent. Never edit, append, rewrite, reformat, or even normalize whitespace in an existing TURN_UNDEAD.md. It is the one exception to the "regenerate freely" pattern that governs CLAUDE.md and AGENTS.md. Treat it as if it were written in stone -- the skill ensures it exists; the user fills it in.
7. **Karpathy Guidelines Create-If-Absent:** `KARPATHY_GUIDELINES.md` follows the same "ensure exists, never overwrite" contract as Turn Undead. Copy the canonical template from `assets/KARPATHY_GUIDELINES.template.md` ONLY when the root file is absent. A present file may carry project-specific merges -- leave it byte-identical. The root AGENTS.md always imports it via a bare `@KARPATHY_GUIDELINES.md` line in Golden Rules.
