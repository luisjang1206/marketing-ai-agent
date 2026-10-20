# 01 프로젝트 뼈대 + 설정 로더

Status: ready-for-agent
Type: task
Blocked by: —
Agent: issue-implementer
Model: sonnet

## 목표
Next.js(App Router, TS, Tailwind, shadcn/ui) + vitest + 의존성 설치. `config.yaml`을 zod로 읽는 `loadConfig()`가 테스트와 함께 동작한다. `pnpm dev`가 뜬다.

## 파일
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`(임시), `components.json`
- Create: `config.yaml`, `.env.example`, `src/lib/config.ts`, `src/lib/paths.ts`, `tests/config.test.ts`
- Modify: `.gitignore` (create-next-app 항목 병합), `README.md`(제목만)

## 인터페이스 (뒤 이슈가 의존)
```ts
// src/lib/config.ts
export type Channel = { id: string; test: boolean }
export type Profile = { id: string; label: string; index: number }   // id = 'p1' | 'p2' | 'p3'
export type AppConfig = {
  profiles: string[]                       // ['유튜브1','유튜브2','유튜브3']
  channels: Channel[]
  comment: { min_chars: number; max_chars: number; brand: string; banned_phrases: string[]; brand_phrases: string[] }
  limits: { daily_max_comments: number }
  fetch: { per_channel: number }
  typing: { min_delay_ms: number; max_delay_ms: number }
}
export function parseConfig(yamlText: string): AppConfig       // zod 검증, 실패 시 throw
export function loadConfig(path?: string): AppConfig           // 기본 '<cwd>/config.yaml'
export function profilesOf(cfg: AppConfig): Profile[]          // [{id:'p1',label:'유튜브1',index:1}, ...]
export function allowedChannelIds(cfg: AppConfig): string[]
export function testChannelIds(cfg: AppConfig): string[]

// src/lib/paths.ts
export function dataDir(): string                 // <cwd>/data
export function dbPath(): string                  // data/agent.db
export function profileDir(index: number): string // data/profiles/<index>
export function screenshotDir(): string           // data/screenshots
export function captionDir(): string              // data/captions
export function ensureDataDirs(): void            // mkdir -p 전부
```

## 단계
- [ ] 1. 형제 임시 폴더에 생성 후 복사 (현재 폴더에 파일이 있어 create-next-app이 거부함)
```bash
cd /Users/luisjang/Documents/Development/Study
pnpm create next-app@latest marketing-ai-agent-tmp --ts --app --tailwind --eslint --src-dir --import-alias "@/*" --use-pnpm --turbopack --no-git
rsync -a --exclude .git --exclude .gitignore marketing-ai-agent-tmp/ marketing-ai-agent/
cat marketing-ai-agent-tmp/.gitignore >> marketing-ai-agent/.gitignore   # 중복 줄은 손으로 정리
rm -rf marketing-ai-agent-tmp
```
- [ ] 2. 의존성
```bash
pnpm add yaml zod @anthropic-ai/sdk playwright swr
pnpm add -D vitest @types/node
pnpm dlx shadcn@latest init -d
pnpm dlx shadcn@latest add button card badge select table tooltip alert input separator skeleton
```
- [ ] 3. `next.config.ts`
```ts
import type { NextConfig } from 'next'
const nextConfig: NextConfig = { serverExternalPackages: ['playwright'] }
export default nextConfig
```
- [ ] 4. `vitest.config.ts`
```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
})
```
`package.json` scripts에 `"test": "vitest run"`, `"test:watch": "vitest"` 추가.
- [ ] 5. `config.yaml` — spec §5 그대로. `.env.example`:
```
YOUTUBE_API_KEY=
ANTHROPIC_API_KEY=
# ANTHROPIC_MODEL=claude-sonnet-5-5
```
- [ ] 6. 실패하는 테스트 `tests/config.test.ts`
```ts
import { describe, it, expect } from 'vitest'
import { parseConfig, profilesOf, allowedChannelIds, testChannelIds } from '@/lib/config'

const yaml = `
profiles: [유튜브1, 유튜브2]
channels:
  - UCxlc0Ky0aWoD8uI09ad44Tg
  - { id: UCkGl2jieOVhGiHPdXF77Yyw, test: true }
comment: { min_chars: 40, max_chars: 120, brand: 운명원, brand_phrases: [잘 본다던데] }
limits: { daily_max_comments: 10 }
`
describe('parseConfig', () => {
  it('normalizes channels to {id,test}', () => {
    const cfg = parseConfig(yaml)
    expect(cfg.channels).toEqual([
      { id: 'UCxlc0Ky0aWoD8uI09ad44Tg', test: false },
      { id: 'UCkGl2jieOVhGiHPdXF77Yyw', test: true },
    ])
  })
  it('applies defaults for fetch/typing/banned_phrases', () => {
    const cfg = parseConfig(yaml)
    expect(cfg.fetch.per_channel).toBe(5)
    expect(cfg.typing).toEqual({ min_delay_ms: 40, max_delay_ms: 110 })
    expect(cfg.comment.banned_phrases).toEqual([])
  })
  it('derives profiles with ids p1..pn', () => {
    expect(profilesOf(parseConfig(yaml))).toEqual([
      { id: 'p1', label: '유튜브1', index: 1 }, { id: 'p2', label: '유튜브2', index: 2 },
    ])
  })
  it('splits allowed and test channel ids', () => {
    const cfg = parseConfig(yaml)
    expect(allowedChannelIds(cfg)).toEqual(['UCxlc0Ky0aWoD8uI09ad44Tg', 'UCkGl2jieOVhGiHPdXF77Yyw'])
    expect(testChannelIds(cfg)).toEqual(['UCkGl2jieOVhGiHPdXF77Yyw'])
  })
  it('rejects a bad channel id', () => {
    expect(() => parseConfig(yaml.replace('UCxlc0Ky0aWoD8uI09ad44Tg', 'nope'))).toThrow()
  })
})
```
- [ ] 7. `pnpm test` → FAIL (모듈 없음)
- [ ] 8. `src/lib/config.ts` 구현
```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'

const channelId = z.string().regex(/^UC[\w-]{22}$/, '채널 ID 형식이 아닙니다')
const ChannelSchema = z
  .union([channelId, z.object({ id: channelId, test: z.boolean().optional() })])
  .transform((c) => (typeof c === 'string' ? { id: c, test: false } : { id: c.id, test: c.test ?? false }))

export const AppConfigSchema = z.object({
  profiles: z.array(z.string().min(1)).min(1).max(3),
  channels: z.array(ChannelSchema).min(1),
  comment: z.object({
    min_chars: z.number().int().positive(),
    max_chars: z.number().int().positive(),
    brand: z.string().min(1),
    banned_phrases: z.array(z.string()).default([]),
    brand_phrases: z.array(z.string()).min(1),
  }),
  limits: z.object({ daily_max_comments: z.number().int().positive() }),
  fetch: z.object({ per_channel: z.number().int().min(1).max(50) }).default({ per_channel: 5 }),
  typing: z
    .object({ min_delay_ms: z.number().int().min(0), max_delay_ms: z.number().int().min(0) })
    .default({ min_delay_ms: 40, max_delay_ms: 110 }),
})
export type AppConfig = z.infer<typeof AppConfigSchema>
export type Channel = AppConfig['channels'][number]
export type Profile = { id: string; label: string; index: number }

export function parseConfig(yamlText: string): AppConfig {
  return AppConfigSchema.parse(parse(yamlText))
}
export function loadConfig(p = path.join(process.cwd(), 'config.yaml')): AppConfig {
  return parseConfig(readFileSync(p, 'utf8'))
}
export function profilesOf(cfg: AppConfig): Profile[] {
  return cfg.profiles.map((label, i) => ({ id: `p${i + 1}`, label, index: i + 1 }))
}
export function allowedChannelIds(cfg: AppConfig): string[] {
  return cfg.channels.map((c) => c.id)
}
export function testChannelIds(cfg: AppConfig): string[] {
  return cfg.channels.filter((c) => c.test).map((c) => c.id)
}
```
- [ ] 9. `src/lib/paths.ts`
```ts
import { mkdirSync } from 'node:fs'
import path from 'node:path'
export const dataDir = () => path.join(process.cwd(), 'data')
export const dbPath = () => path.join(dataDir(), 'agent.db')
export const profileDir = (index: number) => path.join(dataDir(), 'profiles', String(index))
export const screenshotDir = () => path.join(dataDir(), 'screenshots')
export const captionDir = () => path.join(dataDir(), 'captions')
export function ensureDataDirs(): void {
  for (const d of [dataDir(), screenshotDir(), captionDir(), path.join(dataDir(), 'profiles')]) mkdirSync(d, { recursive: true })
}
```
- [ ] 10. `pnpm test` → PASS. `pnpm dev` 띄워 `http://localhost:3000` 응답 확인 후 종료.
- [ ] 11. 커밋
```bash
git add -A && git commit -m "feat: scaffold Next.js app with config loader and vitest"
```

## 완료 기준
`pnpm test` 녹색, `pnpm dev` 기동, `config.yaml`·`.env.example` 커밋, `.env.local`·`data/` 미추적.
