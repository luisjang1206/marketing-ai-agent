# 05 자막 수집 (yt-dlp) + VTT 파서

Status: ready-for-agent
Type: task
Blocked by: 02

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
- [ ] 1. `tests/captions.test.ts`
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
- [ ] 2. FAIL 확인
- [ ] 3. 구현
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
- [ ] 4. PASS → 커밋 `feat: fetch Korean captions via yt-dlp with VTT parser`
- [ ] 5. 실환경: `brew install yt-dlp` 후 `youtu.be/akn-AvCeHBI`로 1회 실행해 파일명 규칙(`<id>.ko.vtt`) 확인. 다르면 `file` 경로 수정하고 README 설치 안내에 반영.

## 완료 기준
테스트 녹색. yt-dlp 없이도 `source:'none'`으로 돌아온다.
