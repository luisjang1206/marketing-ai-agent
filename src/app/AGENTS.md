# AGENTS.md -- src/app (UI + Route Handlers)

## Module Context

Next.js App Router layer: the single-page Korean dashboard, the `/settings` profile login page, and thin Route Handlers under `src/app/api/`. Feature components live in `src/components/`, shadcn primitives in `src/components/ui/`; both follow this file.

- Downstream: every Route Handler calls into `src/lib/` (see [src/lib/AGENTS.md](../lib/AGENTS.md)). UI reads state only through these handlers.
- Current state: all Route Handlers under `src/app/api/` are in place (issue 09; the screenshot route and the UI are issue 10). The dashboard (`page.tsx`, `src/components/{StepHeader,VideoList,DraftPanel,PostPanel,PostLog,ProfileCard}.tsx`) and `/settings` exist; `src/lib/client/api.ts` holds the fetch wrapper and swr keys. Issue 10's browser checklist is still partly pending (see the issue file).

## Tech Stack & Constraints

- Next.js 16.4.2 (Turbopack) + React 19.3. APIs differ from older Next.js; read `node_modules/next/dist/docs/` before writing Next.js code.
- Tailwind CSS v4, CSS-first: theme and imports in `src/app/globals.css`; no `tailwind.config`. Turbopack runs `@tailwindcss/turbopack` for `*.css` (`next.config.ts`).
- shadcn style `base-nova` (`components.json`) built on `@base-ui/react`, not Radix. Icons: `lucide-react`. Class merge: `cn` (`import { cn } from "cn"` in `ui/`, `@/lib/utils` elsewhere).
- `swr` for polling. No other client state library.
- `playwright` is in `serverExternalPackages`; it must never enter a client bundle.
- Route Handlers run on Node: `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'` in every route (issue 09).

## Implementation Patterns

### Route Handlers

Thin: validate input -> call `src/lib` -> return JSON. Errors are always `{ reason, message }` with a Korean message.

```ts
const id = parseVideoId(body.url)
if (!id) return NextResponse.json({ reason: 'invalid_url', message: '유튜브 영상 링크가 아닙니다' }, { status: 400 })
const verdict = checkPostAllowed({ /* repo values */ })
if (!verdict.allowed) {
  insertPost(db, { /* status: 'blocked', reason: verdict.reason */ })
  return NextResponse.json({ reason: verdict.reason, message: verdict.message }, { status: 409 })
}
```

- Re-check Operating Rules on the server even when the UI already disabled the button.
- Fire-and-forget long work (`runPostJob`, `openForLogin`) and return 202; progress is read back from `jobs`.

### UI

- Three numbered panels, each with a title and a one-line hint: ① 영상 불러오기, ② 영상 선택, ③ 댓글 달기. Post Log table below, newest first. Header badge "오늘 게시 N/10" and a settings link.
- Pre-disable [댓글 달기] with the client-side `checkPostAllowed` verdict (plus invalid Draft or busy job); show the verdict message in a Tooltip.
- Progress stepper maps job state: `opening_profile` 프로필 여는 중, `typing` 입력 중, `posted` 게시 완료, `verified` 댓글 보기.
- Polling intervals (issue 10): `/api/log` 2s, `/api/profiles` 5s, `/api/posts/<jobId>` 500ms while a job runs, then stop and revalidate the log.
- `layout.tsx`: `<html lang="ko">`, system font stack; do not load web fonts (offline demo stability). The scaffold's Geist fonts and `lang="en"` were replaced in issue 10; `globals.css` defines the system font stack.
- Add primitives with the shadcn CLI, then import from `@/components/ui/<name>`. Do not hand-edit generated primitives unless a feature requires it.

## API Surface

```
GET  /api/config                      public config: profiles, dailyMax, allowed/test channel IDs, comment limits
GET  /api/videos ?refresh=1           list allowed-channel videos (refresh refetches from Data API)
POST /api/videos {url}                Direct Link: 400 invalid_url | 404 | 409 not_allowed_channel (logged as blocked) | {video}
POST /api/videos/[id]/draft {regenerate?}   generate or return cached Draft
POST /api/posts {videoId, profileId?} 202 {jobId} | 409 {reason: rule code | 'busy'} | 400
GET  /api/posts/[jobId]               job progress
GET  /api/log                         Post Log + today's success count
GET  /api/profiles                    profile login status
POST /api/profiles/[id]/login         open Chrome for human login, 202
POST /api/profiles/[id]/check         read login state + channel name
GET  /api/screenshots/[file]          serve data/screenshots/<file> as image/png (issue 10)
```

Full contract: spec section 4 and issue 09 (issue 10 adds the screenshot route). In the screenshot route, accept `path.basename(file)` only to block path traversal.

## Testing Strategy

- No unit tests for Route Handlers or components (spec section 12). Keep logic in `src/lib/` where it is tested.
- Verify handlers with curl against `pnpm dev` (issue 09 lists the expected JSON); verify UI by hand in the browser.
- `pnpm build` and `pnpm lint` must pass before commit.

## Local Golden Rules

- Never import `playwright`, `node:sqlite`, `@/lib/db`, `@/lib/repo/*`, or adapter modules into a `'use client'` file. Client code may import pure modules only.
- All user-visible strings are Korean and use CONTEXT.md terms (button label "댓글 달기", never 업로드/전송/발행).
- Never add `runtime = 'edge'`; Playwright and `node:sqlite` need Node.
- Never keep job or progress state in React-only memory across reloads; the source of truth is the `jobs` table via the API.

<!-- custom -->
<!-- Add project-specific notes below. This block is preserved across regeneration. -->
<!-- /custom -->
