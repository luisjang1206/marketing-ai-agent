import { describe, it, expect, vi } from 'vitest'
import { generateDraft } from '@/lib/draft/generate'
import { buildUserPrompt } from '@/lib/draft/prompt'
const rules = { minChars: 40, maxChars: 120, brand: '운명원', bannedPhrases: [] }
const cfg = { rules, brandPhrases: ['잘 본다던데'] }
const ctx = { video: { title: '남자심리 분석', description: '', channelTitle: '외롭여' }, captions: '연락 텀이 길어지면', topComments: ['저도요'] }
const good = { concern: '썸남 연락 텀', evidence: '연락 텀이 길어지면', text: '연락 텀 길어지면 식은 거라는 말에 뜨끔 ㅠㅠ 운명원 연애사주가 그렇게 잘 본다던데 나도 한번 보고 싶다.' }

describe('generateDraft', () => {
  it('returns on first valid attempt', async () => {
    const llm = vi.fn(async () => good)
    const r = await generateDraft(ctx, cfg, llm)
    expect(r.attempts).toBe(1); expect(r.validation.ok).toBe(true); expect(r.draft).toEqual(good)
  })
  it('retries with violations fed back, up to maxRetries', async () => {
    const llm = vi.fn<Parameters<typeof generateDraft>[2]>()
      .mockResolvedValueOnce({ ...good, text: '너무 짧음 운명원' })
      .mockResolvedValueOnce(good)
    const r = await generateDraft(ctx, cfg, llm)
    expect(r.attempts).toBe(2); expect(r.validation.ok).toBe(true)
    expect(llm.mock.calls[1][1]).toContain('too_short')
  })
  it('gives up after maxRetries and returns the last invalid draft', async () => {
    const llm = vi.fn(async () => ({ ...good, text: '짧음' }))
    const r = await generateDraft(ctx, { ...cfg, maxRetries: 2 }, llm)
    expect(r.attempts).toBe(3); expect(r.validation.ok).toBe(false); expect(r.validation.violations).toContain('too_short')
  })
  it('user prompt says captions are missing when null', () => {
    expect(buildUserPrompt({ ...ctx, captions: null })).toContain('자막 없음')
  })
})

describe('buildUserPrompt shape hint', () => {
  const shape = (title: string) => buildUserPrompt({ ...ctx, video: { ...ctx.video, title } }).split('\n').find((l) => l.startsWith('이번 댓글 짜임:'))
  it('gives the same video the same shape and spreads different videos across shapes', () => {
    expect(shape('남자심리 분석')).toBeDefined()
    expect(shape('남자심리 분석')).toBe(shape('남자심리 분석'))
    const titles = ['남자는 ‘원래 그런 사람’이 아닙니다', '남자 때문에 힘들어하는 여자들 공통점', '썸붕난 이유, 살리는 법', '남자심리 분석']
    expect(new Set(titles.map(shape)).size).toBe(titles.length)
  })
})

describe('buildUserPrompt recentDrafts', () => {
  const line = (p: string) => p.split('\n').find((l) => l.startsWith('이번 댓글 짜임:'))
  const recent = ['요즘 나 연락 텀 하나에 하루가 왔다갔다 함. 운명원 사주 본다던데 나도 볼까', '"연락은 마음이다" 이 말 듣고 반성함 ㅠㅠ 운명원 얘기를 들어서 더 생각나요']
  it('treats missing and empty recentDrafts the same', () => {
    expect(buildUserPrompt({ ...ctx, recentDrafts: [] })).toBe(buildUserPrompt(ctx))
  })
  it('lists recent channel drafts when given', () => {
    const p = buildUserPrompt({ ...ctx, recentDrafts: recent })
    expect(p).toContain('같은 채널에 이미 쓴 댓글')
    for (const t of recent) expect(p).toContain(t)
  })
  it('is deterministic and changes the shape when a previous draft of the same video is added (regenerate)', () => {
    const c = { ...ctx, recentDrafts: recent }
    expect(line(buildUserPrompt(c))).toBe(line(buildUserPrompt(c)))
    expect(line(buildUserPrompt({ ...ctx, recentDrafts: [good.text, ...recent] }))).not.toBe(line(buildUserPrompt(c)))
    expect(line(buildUserPrompt({ ...ctx, recentDrafts: [good.text] }))).not.toBe(line(buildUserPrompt(ctx)))
  })
  it('keeps the shape on a retry', () => {
    const retry = { text: '짧음', violations: ['too_short' as const] }
    expect(line(buildUserPrompt(ctx, retry))).toBe(line(buildUserPrompt(ctx)))
    const c = { ...ctx, recentDrafts: recent }
    expect(line(buildUserPrompt(c, retry))).toBe(line(buildUserPrompt(c)))
  })
  it('avoids an opening that recent drafts already used', () => {
    const laughs = ['ㅋㅋ 진짜 내 얘기네 운명원 본다던데', 'ㅋㅋㅋ 아니 이거 뭐야 운명원 얘기 들어서']
    for (const title of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      expect(line(buildUserPrompt({ ...ctx, video: { ...ctx.video, title }, recentDrafts: laughs }))).not.toContain('웃음')
    }
  })
  it('when every closing is already used, avoids the most recently used ones', () => {
    // 최신순: 감정 · 질문 · 행동 · 다짐 · 속말 · 나머지 끝맺음을 하나씩 쓴 초안
    const all = ['A 영상 보고 찔림 ㅠㅠ', 'B 이거 나만 그래요?', 'C 이번 주엔 연락 안 해볼래요.', 'D 이제 안 참을 거임', 'E 오빠 그냥 말해 주면 안 돼요.', 'F 그냥 그런 하루였어요.']
    for (const title of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const l = line(buildUserPrompt({ ...ctx, video: { ...ctx.video, title }, recentDrafts: all }))!
      for (const recentHint of ['짧은 감정 표현으로 끝', '묻는 물음표 문장으로 끝', '해 볼 행동으로 끝']) expect(l).not.toContain(recentHint)
    }
  })
  // 제목 40개에 걸쳐 배정된 꼴의 집합. 최근 초안이 "쓴 것"으로 잡힌 꼴은 집합에서 빠진다.
  const SHAPE = /^이번 댓글 짜임: (.+?)\. 브랜드 문장은 후반에 (.+?) 꼴로 씁니다\. 궁금증의 방향: (.+?)\. (.+)\.$/
  const assigned = (recentDrafts: string[], part: 0 | 1 | 3) => new Set(Array.from({ length: 40 }, (_, i) =>
    SHAPE.exec(line(buildUserPrompt({ ...ctx, video: { ...ctx.video, title: 't' + i }, recentDrafts }))!)![part + 1]))
  it('counts only the most specific hearsay form a draft used', () => {
    const s = every(1, ['영상 보고 찔림. 친구가 운명원 사주 봤다고 하던데 나도 궁금해요'])
    expect(s.has('"친구가 ~ 봤대"')).toBe(false)
    expect(s.has('"~다던데"')).toBe(true)
    expect(s.size).toBe(every(1).size - 1)
  })
  it('does not mistake unrelated words for a used form', () => {
    // "봤다가"·"친구가 한 말"은 친구 전문이 아니다
    expect(assigned(['이 영상 봤다가 어제 친구가 한 말이 생각났음. 운명원 잘 본다던데 나도 궁금해요'], 1).has('"친구가 ~ 봤대"')).toBe(true)
    // "…남자"로 끝나는 건 반말 다짐이 아니다
    expect(assigned(['영상 보고 생각해 보니 결국 문제는 그 남자'], 3).has('반말 혼잣말 다짐으로 끝')).toBe(true)
    // "와닿았어요"는 감탄 시작이 아니다
    expect(assigned(['와닿았어요 이 말. 운명원 잘 본다던데 궁금해요'], 0).has('웃음이나 감탄으로 시작')).toBe(true)
  })
  // 이슈 14: 짧은 전문 어미, 한 문장짜리 "처음엔" 시작, 판별식 정리
  const every = (part: 0 | 1 | 3, recentDrafts: string[] = []) => new Set(Array.from({ length: 300 }, (_, i) =>
    SHAPE.exec(line(buildUserPrompt({ ...ctx, video: { ...ctx.video, title: 'v' + i }, recentDrafts }))!)![part + 1]))
  const NO_CLOSING = '끝맺음 문장 없이 브랜드 문장으로 마무리'
  it('gives hearsay hints of at most 7 characters, each recognised as its own form only', () => {
    const hints = [...every(1)]
    expect(hints.length).toBeGreaterThanOrEqual(7)   // 최근 초안 6개(목록 5 + 재생성)여도 빈 꼴이 남는다
    for (const h of hints) {
      expect([...h.replace(/["~\s]/g, '')].length).toBeLessThanOrEqual(7)
      const left = every(1, [`영상 보고 찔림. 운명원 ${h.replace(/"/g, '').replace('~', '잘 본')} 나도 궁금해요`])
      expect(left.has(h)).toBe(false); expect(left.size).toBe(hints.length - 1)
    }
  })
  it('makes the "처음엔" opening one sentence with no separate closing', () => {
    const lines = Array.from({ length: 300 }, (_, i) => line(buildUserPrompt({ ...ctx, video: { ...ctx.video, title: 'v' + i } }))!)
    const doubt = lines.filter((l) => l.includes('처음엔'))
    expect(doubt.length).toBeGreaterThan(0)
    for (const l of doubt) { expect(SHAPE.exec(l)![1]).toContain('한 문장'); expect(SHAPE.exec(l)![4]).toBe(NO_CLOSING) }
    for (const l of lines.filter((l) => !l.includes('처음엔'))) expect(SHAPE.exec(l)![4]).not.toBe(NO_CLOSING)
  })
  it('reads the content of an opening or closing before a trailing emotion or question mark', () => {
    const a = every(3, ['영상 보고 찔림. 운명원 잘 본다던데 이번 주엔 연락 안 할래ㅠㅠ'])
    expect(a.has('이번 주에 해 볼 행동으로 끝')).toBe(false); expect(a.has('"ㅠㅠ"나 "ㅋㅋ" 같은 짧은 감정 표현으로 끝')).toBe(true)
    const b = every(3, ['영상 보고 찔림. 운명원 잘 본다던데 오늘부터 참아볼까?'])
    expect(b.has('이번 주에 해 볼 행동으로 끝')).toBe(false); expect(b.has('다른 시청자에게 묻는 물음표 문장으로 끝')).toBe(true)
    const c = every(0, ['요즘 나 왜 이럴까? 운명원 잘 본다던데'])
    expect(c.has('"요즘"이나 "나/저"로 시작하는 내 상황 고백')).toBe(false); expect(c.has('물음표로 끝나는 질문 한 문장으로 시작')).toBe(true)
  })
  it('splits sentences at ㅠㅠ and … so the hearsay form is read from the brand sentence only', () => {
    expect(every(1, ['친구가 한 말이 생각났음ㅠㅠ 운명원 다들 봤대']).has('"친구가 ~ 봤대"')).toBe(true)
    expect(every(1, ['어제 친구가 봤다는 영상… 운명원 잘 본다길래 나도']).has('"친구가 ~ 봤대"')).toBe(true)
  })
  it('avoids a hearsay form that recent drafts already used', () => {
    const friend = ['영상 보고 찔림. 친구가 운명원 사주로 인연 봤다던데 일단 참아볼래요']
    for (const title of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      expect(line(buildUserPrompt({ ...ctx, video: { ...ctx.video, title }, recentDrafts: friend }))).not.toContain('친구가')
    }
  })
})
