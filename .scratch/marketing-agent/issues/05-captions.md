# 05 자막 수집 (yt-dlp) + VTT 파서

Status: resolved
Type: task
Blocked by: 02
Agent: issue-implementer
Model: sonnet

## 목표
yt-dlp로 한국어 자막(수동 또는 자동)을 받아 평문으로 만든다. yt-dlp가 없거나 자막이 없으면 `source:'none'`으로 조용히 폴백한다.

## 파일
- Create: `src/lib/youtube/captions.ts`
- Test: `tests/captions.test.ts`

## 인터페이스
```ts
export function parseVtt(vtt: string): string                 // 헤더·타임스탬프·태그 제거, 연속 중복 줄 제거, 줄 → 공백 결합
export type CaptionResult = { text: string; source: 'subtitle' | 'none' }
export type ExecFn = (cmd: string, args: string[]) => Promise<{ code: number; stderr: string }>
export async function fetchCaptions(videoId: string, opts: { outDir: string; maxChars?: number; exec?: ExecFn }): Promise<CaptionResult>
```
yt-dlp 호출: `yt-dlp --skip-download --write-sub --write-auto-sub --sub-lang ko --sub-format vtt --no-warnings -o "<outDir>/%(id)s" https://www.youtube.com/watch?v=<id>` → 성공 시 `<outDir>/<id>.ko.vtt`. 이미 파일이 있으면 호출 생략(캐시).

## 단계
- [x] 1. `tests/captions.test.ts`
```ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseVtt, fetchCaptions } from '@/lib/youtube/captions'

const VTT = `WEBVTT
Kind: captions
Language: ko

00:00:00.000 --> 00:00:02.000 align:start position:0%
남자 심리는<00:00:01.000><c> 알다가도</c>

00:00:02.000 --> 00:00:04.000
남자 심리는 알다가도

00:00:04.000 --> 00:00:06.000
모르겠어요 ㅠㅠ
`
describe('parseVtt', () => {
  it('strips cues, inline tags and consecutive duplicates', () => {
    expect(parseVtt(VTT)).toBe('남자 심리는 알다가도 모르겠어요 ㅠㅠ')
  })
})
describe('fetchCaptions', () => {
  it('returns none when yt-dlp is missing', async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'cap-'))
    const exec = async () => { throw Object.assign(new Error('spawn yt-dlp ENOENT'), { code: 'ENOENT' }) }
    expect(await fetchCaptions('abc', { outDir, exec })).toEqual({ text: '', source: 'none' })
  })
  it('returns none when yt-dlp ran but produced no file', async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'cap-'))
    expect(await fetchCaptions('abc', { outDir, exec: async () => ({ code: 0, stderr: '' }) })).toEqual({ text: '', source: 'none' })
  })
  it('parses the produced file and truncates to maxChars', async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'cap-'))
    const exec = async () => { writeFileSync(path.join(outDir, 'abc.ko.vtt'), VTT); return { code: 0, stderr: '' } }
    const r = await fetchCaptions('abc', { outDir, exec, maxChars: 10 })
    expect(r).toEqual({ text: '남자 심리는 알다가', source: 'subtitle' })
  })
  it('skips yt-dlp when the file is cached', async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'cap-'))
    writeFileSync(path.join(outDir, 'abc.ko.vtt'), VTT)
    let called = false
    await fetchCaptions('abc', { outDir, exec: async () => { called = true; return { code: 0, stderr: '' } } })
    expect(called).toBe(false)
  })
})
```
- [x] 2. FAIL 확인
- [x] 3. 구현
```ts
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export function parseVtt(vtt: string): string {
  const lines: string[] = []
  for (const raw of vtt.split(/\r?\n/)) {
    const line = raw.replace(/<[^>]+>/g, '').trim()
    if (!line || line === 'WEBVTT' || /^(Kind|Language):/.test(line) || /-->/.test(line) || /^\d+$/.test(line)) continue
    if (lines[lines.length - 1] !== line) lines.push(line)
  }
  return lines.join(' ')
}

const defaultExec: ExecFn = (cmd, args) => new Promise((resolve, reject) =>
  execFile(cmd, args, { timeout: 60_000 }, (err, _out, stderr) => {
    if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') return reject(err)
    resolve({ code: err ? 1 : 0, stderr: String(stderr) })
  }))

export async function fetchCaptions(videoId: string, { outDir, maxChars = 6000, exec = defaultExec }: { outDir: string; maxChars?: number; exec?: ExecFn }): Promise<CaptionResult> {
  const file = path.join(outDir, `${videoId}.ko.vtt`)
  if (!existsSync(file)) {
    try {
      await exec('yt-dlp', ['--skip-download', '--write-sub', '--write-auto-sub', '--sub-lang', 'ko', '--sub-format', 'vtt', '--no-warnings',
        '-o', path.join(outDir, '%(id)s'), `https://www.youtube.com/watch?v=${videoId}`])
    } catch { return { text: '', source: 'none' } }
  }
  if (!existsSync(file)) return { text: '', source: 'none' }
  const text = parseVtt(readFileSync(file, 'utf8'))
  return text ? { text: [...text].slice(0, maxChars).join(''), source: 'subtitle' } : { text: '', source: 'none' }
}
```
- [x] 4. PASS → 커밋 `feat: fetch Korean captions via yt-dlp with VTT parser`
- [x] 5. (실환경 확인 2026-10-20 완료, 파일명 `<id>.ko.vtt` 일치 — Comments 참조) 실환경: `brew install yt-dlp` 후 `youtu.be/akn-AvCeHBI`로 1회 실행해 파일명 규칙(`<id>.ko.vtt`) 확인. 다르면 `file` 경로 수정하고 README 설치 안내에 반영.

## 완료 기준
테스트 녹색. yt-dlp 없이도 `source:'none'`으로 돌아온다.

## Comments

TDD 순서대로 진행: `tests/captions.test.ts`를 먼저 쓰고 모듈이 없어 실패하는 것을 확인한 뒤 구현했고, 전체 `pnpm test` 42개 통과(captions 5개 포함), `tsc --noEmit`과 `pnpm lint` 클린. 인터페이스(이름·시그니처·경로)는 이슈와 동일하다. 이슈와 다른 점은 하나뿐 — 이슈 코드가 쓰는 `CaptionResult`와 `ExecFn` 타입 선언이 스케치에 빠져 있어, 인터페이스 절의 정의 그대로 `captions.ts` 상단에 `export type`으로 선언했다(런타임 동일). 실환경 확인 (2026-10-20, 커밋 안 한 일회용 스크립트, 출력 폴더는 임시 디렉터리): `brew install yt-dlp`(2026.08.19) 후 `akn-AvCeHBI`로 `fetchCaptions`를 1회 호출해 5.4초 만에 `<outDir>/akn-AvCeHBI.ko.vtt` 한 개가 생성됐고 파일명 규칙이 이슈와 일치해서 `file` 경로 수정은 필요 없었다. 결과는 `source:'subtitle'`, 원본 VTT 약 247KB를 `parseVtt`로 풀면 14,278자(타임스탬프·인라인 태그 잔여물 없음, 롤링 자막의 연속 중복 줄도 제거됨)이고 기본 `maxChars` 6,000에 맞춰 잘렸다. 두 번째 호출은 캐시로 yt-dlp를 건너뛰었다(2ms). 열린 질문: ADR-0003이 요구하는 yt-dlp 설치 안내(`brew install yt-dlp`)가 들어갈 README는 아직 제목 한 줄뿐이라 이번 이슈에서는 README를 건드리지 않았다(파일명이 달랐을 때만 반영하라는 단계 5 조건에 해당하지 않음) — README 작성 이슈에서 설치 절에 넣어야 한다.

리뷰 후속 수정 (`8df88b3` + 이어진 커밋): 리뷰어 지적 두 건과 제안 한 건을 반영했다. (1) `fetchCaptions`가 `parseVideoId(videoId) === videoId`가 아니면 `{ text: '', source: 'none' }`을 바로 돌려준다 — 이슈 09의 `POST /api/videos/[id]/draft`처럼 라우트에서 온 `[id]`가 `path.join(outDir, ...)`로 `outDir` 밖(`../../../etc/x`)을 가리킬 수 있어서다. 이 때문에 `fetchCaptions`는 11자 bare id만 받으며, 위 테스트 블록의 `'abc'`는 `ID = 'abcdefghijk'`로 바꿨다(커밋된 테스트가 이슈 블록과 다른 이유). (2) `parseVtt`는 `Kind:`/`Language:`를 키별로 거르는 대신 `WEBVTT`부터 첫 빈 줄까지 헤더 블록 전체를 건너뛴다. YouTube 자동자막 헤더의 `Style:`·`::cue(...) { ... }`·`}`·`##` 줄이 본문으로 새던 문제를 막는다. 빈 줄 없이 헤더 바로 뒤에 큐가 오는 VTT에서 첫 큐들이 사라지지 않도록 헤더는 `-->` 타이밍 줄에서도 끝난다. (3) yt-dlp가 0이 아닌 코드로 끝나면 stderr를 `console.warn`으로 남겨 조용한 `'none'`을 추적할 수 있다. 각 건마다 테스트를 먼저 추가해 실패를 확인했고(잘못된 id·경로 탈출 id는 exec 미호출, Style 헤더, 빈 줄 없는 헤더, stderr 경고) 지금 captions 15개를 포함해 전체 통과한다.
