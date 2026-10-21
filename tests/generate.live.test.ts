// 실키 확인용. 커밋하지 않는다.
// 실행: set -a && . ./.env.local && set +a && pnpm exec vitest run tests/generate.live.test.ts --silent=false --reporter=verbose
import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parse } from 'yaml'
import { AppConfigSchema } from '@/lib/config'
import { fetchCaptions } from '@/lib/youtube/captions'
import { createYoutubeApi } from '@/lib/youtube/api'
import { generateDraft } from '@/lib/draft/generate'
import { buildUserPrompt, type DraftContext } from '@/lib/draft/prompt'
import { createAnthropicDraftLLM, envLocalBaseURL } from '@/lib/draft/anthropic'

// 외롭여 영상 5개를 차례로 만들고, 가운데 영상을 [다시 생성]처럼 한 번 더 만든다(이슈 13 단계 4).
const IDS = ['hpEnIwoH_sw', 'OX5T33ozOuE', 'pDe6cMhBitI', 'k_0c0m0Hk5k', 'xIg3zTQ5Kt4']
const REGEN = 2
const SHAPE = /^이번 댓글 짜임: (.+?)\. 브랜드 문장은 후반에 (.+?) 꼴로 씁니다\. 궁금증의 방향: (.+?)\. (.+)\.$/

// 띄어쓰기를 뺀 두 문자열의 가장 긴 공통 부분 문자열
function lcs(a: string, b: string): string {
  const x = [...a.replace(/\s/g, '')], y = [...b.replace(/\s/g, '')]; let best = ''
  const dp = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0))
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) {
    if (x[i - 1] !== y[j - 1]) continue
    dp[i][j] = dp[i - 1][j - 1] + 1
    if (dp[i][j] > best.length) best = x.slice(i - dp[i][j], i).join('')
  }
  return best
}

describe('generateDraft (live, channel chain)', () => {
  const key = process.env.ANTHROPIC_API_KEY, ytKey = process.env.YOUTUBE_API_KEY
  const comment = AppConfigSchema.shape.comment.parse(parse(readFileSync('config.yaml', 'utf8')).comment)
  const rules = { minChars: comment.min_chars, maxChars: comment.max_chars, brand: comment.brand, bannedPhrases: comment.banned_phrases }

  it.skipIf(!key || !ytKey)('chains 5 videos with recentDrafts, then regenerates one', async () => {
    const llm = createAnthropicDraftLLM({ apiKey: key!, model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5', baseURL: envLocalBaseURL() })
    const yt = createYoutubeApi(ytKey!)
    const outDir = mkdtempSync(path.join(tmpdir(), 'live-captions-'))
    const history: string[] = []   // 최신순, recentChannelDraftTexts 처럼 5개까지
    const out: { label: string; shape: string[]; text: string; ok: boolean; allLong: boolean; brand: number; evidence: string; attempts: number }[] = []

    const own = new Map<string, string>()   // 영상별 최신 초안 (latestDraft)
    async function run(id: string, label: string) {
      const meta = await yt.getVideo(id)
      if (!meta) throw new Error(`영상 없음 ${id}`)
      const cap = await fetchCaptions(id, { outDir })
      const topComments = await yt.getTopComments(id).catch(() => [])
      const ctx: DraftContext = { video: { title: meta.title, description: meta.description, channelTitle: meta.channelTitle },
        captions: cap.source === 'subtitle' ? cap.text : null, topComments,
        // 이슈 09 라우트와 같게: 같은 영상 최신 초안을 맨 앞에, 뒤에 채널 최근 5개에서 그것을 뺀 나머지
        recentDrafts: own.has(id) ? [own.get(id)!, ...history.slice(0, 5).filter((t) => t !== own.get(id))] : history.slice(0, 5) }
      const shapeLine = buildUserPrompt(ctx).split('\n').find((l) => l.startsWith('이번 댓글 짜임:'))!
      const shape = SHAPE.exec(shapeLine)!.slice(1)
      const lens: number[] = []
      const logged: typeof llm = async (s, u) => { const d = await llm(s, u); lens.push([...d.text.trim()].length); console.log(`attempt ${label}: ${lens.at(-1)}자 ${d.text}`); return d }
      const r = await generateDraft(ctx, { rules, brandPhrases: comment.brand_phrases }, logged)
      history.unshift(r.draft.text); own.set(id, r.draft.text)
      out.push({ label, shape, text: r.draft.text, ok: r.validation.ok, allLong: lens.length === 3 && lens.every((n) => n > rules.maxChars), brand: r.draft.text.split(comment.brand).length - 1, evidence: r.draft.evidence, attempts: r.attempts })
      console.log(JSON.stringify({ label, title: meta.title, captions: cap.source, comments: topComments.length, recent: ctx.recentDrafts!.length,
        shape: shapeLine, attempts: r.attempts, length: r.validation.length, violations: r.validation.violations, ...r.draft }, null, 2))
    }

    for (const id of IDS) await run(id, id)
    await run(IDS[REGEN], `${IDS[REGEN]} (다시 생성)`)

    const pairs: string[] = []
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const s = lcs(out[i].text, out[j].text)
      if ([...s].length >= 8) pairs.push(`${out[i].label} ~ ${out[j].label}: "${s}"`)
    }
    const openings = out.slice(0, IDS.length).map((o) => o.shape[0])
    const orig = out[REGEN], regen = out[out.length - 1]
    console.log('SUMMARY\n' + out.map((o) => `${o.label} | ${o.shape.join(' / ')} | ${o.text}`).join('\n') +
      `\n8자 이상 공통 쌍: ${JSON.stringify(pairs)}\n시작 짜임 서로 다름: ${new Set(openings).size === openings.length}` +
      `\n다시 생성 시작·끝 다름: ${regen.shape[0] !== orig.shape[0]} / ${regen.shape[3] !== orig.shape[3]}` +
      `\n통과 ${out.filter((o) => o.ok).length}/6, 3회 모두 too_long ${out.filter((o) => o.allLong).length}, 운명원 1회 ${out.every((o) => o.brand === 1)}, 근거 ${out.every((o) => o.evidence.trim() !== '')}`)

    for (const o of out) { expect(o.ok).toBe(true); expect(o.brand).toBe(1); expect(o.evidence.trim()).not.toBe('') }
    expect(pairs).toEqual([])
    expect(new Set(openings).size).toBe(openings.length)
    expect(regen.shape[0]).not.toBe(orig.shape[0]); expect(regen.shape[3]).not.toBe(orig.shape[3])
  }, 900_000)
})
