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
    expect(p).toContain('이미 쓴 브랜드 문장:\n- 운명원 사주 본다던데 나도 볼까\n- 운명원 얘기를 들어서 더 생각나요')
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
  it('reads a closing that talks to "너" as the inner-voice form, but not 너무', () => {
    const inner = '그 사람에게 "너"라고 부르며 속으로 하는 말로 끝'
    expect(every(3, ['영상 보고 찔림. 운명원 잘 본다던데 나만 서두른 거면 너한테 미안해']).has(inner)).toBe(false)
    expect(every(3, ['영상 보고 찔림. 운명원 잘 본다던데 너를 아직 못 놓겠어']).has(inner)).toBe(false)
    expect(every(3, ['영상 보고 찔림. 운명원 잘 본다던데 너무 궁금하다']).has(inner)).toBe(true)
  })
  it('does not hand out the catch-all opening or closing while the channel has recent drafts', () => {
    const recentOne = ['요즘 나 연락 텀 하나에 하루가 왔다갔다 함. 운명원 사주 본다던데 이번 주엔 참아볼래']
    expect(every(0, recentOne).has('영상 속 장면을 내 말로 짧게 다시 짚으며 시작')).toBe(false)
    expect(every(3, recentOne).has('내 상황을 담담하게 정리하는 말로 끝')).toBe(false)
    expect(every(0).has('영상 속 장면을 내 말로 짧게 다시 짚으며 시작')).toBe(true)   // 최근 초안이 없으면 이슈 06 그대로
  })
  it('prefers an unused form over avoiding prev, so a free opening is never skipped', () => {
    // 따옴표 · 웃음 · 처음엔 · 고백 시작을 이미 썼다. 판별 가능한 빈 시작은 질문 하나뿐이다.
    const used4 = ['"연락은 마음이다" 이 말에 멈칫했어요. 운명원 잘 본다던데 궁금해요', 'ㅋㅋ 이거 완전 내 얘기네. 운명원 본대서 나도 볼까',
      '처음엔 뻔한 얘기인 줄 알았는데 설득됐어요. 친구가 운명원 봤대', '요즘 나 연락 텀 하나에 하루가 왔다갔다 함. 운명원 많이들 본다길래 궁금']
    const openings = new Set(Array.from({ length: 400 }, (_, i) =>
      SHAPE.exec(line(buildUserPrompt({ ...ctx, video: { ...ctx.video, title: 'p' + i }, recentDrafts: used4 }))!)![1]))
    expect([...openings]).toEqual(['물음표로 끝나는 질문 한 문장으로 시작'])
  })
  it('does not take a later sentence with 들었/봤다 for the brand sentence', () => {
    // 브랜드 문장은 전문 문장이어야 한다. "마음에 들었어요"·"봤다가"가 든 마지막 문장이 아니다.
    expect(every(1, ['영상 보고 찔림. 운명원 잘 본다길래 궁금해요. 이 말이 제일 마음에 들었어요.']).has('"~다길래"')).toBe(false)
    expect(every(1, ['영상 보고 찔림. 운명원 잘 본대서 궁금. 어제 이 영상 봤다가 울었음']).has('"~대서"')).toBe(false)
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

// 이슈 14 실키 R3-B · R4-B · R5-A 에서 실제로 나온 초안 text 를 그대로 다시 넣어 본다(API 호출 없음).
// 녹화된 초안은 옛 짜임으로 쓰였으므로 "배정이 서로 다름"이 아니라 "앞 초안이 실제로 쓴 꼴을 배정하지 않음"을 본다.
// 모델이 배정을 따르면 이것이 곧 배정이 서로 다름이 된다. LABELS 는 각 초안의 실제 시작 꼴(판별식 기준).
describe('replay of recorded live drafts (issue 14)', () => {
  const TITLES = ['남자는 ‘원래 그런 사람’이 아닙니다', '남자 때문에 힘들어하는 여자들 공통점', '썸붕난 이유, 살리는 법', '서운함 많은 여자들이 꼭 알아야 할 것', '남자에게 무시당하는 여자 특징']
  const RUNS: Record<string, { chain: string[]; regen: string }> = {
    'R3-B': { chain: [
      '요즘 썸남 답장 늦으면 ISTP 연락 줄어드는 이유부터 검색했어요ㅠㅠ 나 왜 듣고 싶은 말만 골라 믿지? 운명원에서 그런 것도 나온다고들 하던데. 이번 주엔 검색 대신 연락 빈도를 메모해 볼래요.',
      '크크크 하나 빠진 것도 잡아낸다는 말에서 혼자 웃다가 멈췄어요. 나 완전 그 사람 얘기네 싶어서. 운명원 쪽에서 둘 사이 흐름까지 짚어 준다길래, 우리가 진짜 맞는 사이인지도 나오나 싶네 ㅠㅠ',
      '나 지금 공백인 거야, 그냥 참는 중인 거야? 충동만 참은 건 공백이고 알게 된 게 변화라는 말에서 멈칫했어요. 운명원에서 그 사람 속마음도 본다며, 걔는 나를 한 번이라도 떠올릴까. 나는 아직 변하는 중이야.',
      '처음엔 서운한 게 내 잘못 아니잖아 싶었는데, 남자 점심 스토리에만 열받는 대목에서 설득됐어요ㅋㅋ 나잖아 이거. 친구가 운명원 사주 봤대, 이런 서운함은 언제쯤 덜해지는지 나오려나?',
      'ㅋㅋㅋ 자막을 달아주는 꼴이라는 말에서 빵 터졌어요. 내가 딱 그 통역사였네. 운명원이 두 사람 사이 균형까지 짚는대서 우리는 누가 더 기우는 관계일지 궁금한데, 일단 이제 내 몫만 할 거야.'],
      regen: '"운동을 또 미룹니다"에서 헉했어요. 나 지난주 내내 그랬거든ㅠㅠ 운명원 풀이로는 내가 왜 이렇게 매번 먼저 빠지는지 나온다던데, 나만 서두른 거였다면 미안해, 이제 내 운동하러 갈게.' },
    'R4-B': { chain: [
      '요즘 썸남 연락 줄 때마다 ISTP 글 뒤지며 안심했던 나ㅋㅋ "맞겠냐?"에서 찔렸어요. 운명원 보면 내 패턴도 나온다고들 하던데, 난 왜 듣고 싶은 말만 골랐을까요. 이번 주엔 검색 대신 직접 물어볼래요.',
      'ㅋㅋㅋ 붙이던 게 오늘은 안 붙었다고 철렁하는 거 완전 내 얘기였어요 ㅠㅠ 이런 불안은 언제쯤 잠잠해지나 했는데, 운명원에서 보면 그 시기도 나온다길래 더 궁금해지네. 일단 오늘은 일주일 단위로 보기부터 해볼래.',
      '충동만 참은 건 공백이고 뭘 잘못했는지 안 게 변화라는 말에 멈칫했어요. 난 그냥 2주째 버티기만 한 듯ㅋㅋ 운명원에서 다음 인연 흐름도 본대서 앞으로 어떨지 문득 궁금해짐. 지금은 한 문장 정리 연습 중이에요.',
      '처음엔 서운한 게 내 탓이라니 억울했는데, 친구 카톡은 3시간 안 읽어도 넘기는 대목에서 설득됐어요. 우리 둘은 서로 뭘 사랑이라 느낄지, 운명원은 그런 것도 짚어 준다던데 싶네요.',
      '나도 혹시 통역까지 해주는 쪽이었나? 남자가 말 안 해도 "원래 그런 사람이야" 하고 자막 달아주던 게 딱 나였네요ㅋㅋ 운명원에서는 이런 성향도 나온다던데, 나는 왜 늘 참는 쪽일까요, 다들 어때요?'],
      regen: '예고편만 보고 끝났다는 말에 머릿속 본편 돌리던 내가 딱 보였는데, 나만 이러는 거예요? 친구가 운명원 보고 상대 속마음이 나왔대서 걔는 그날 진짜 어땠을지 자꾸 생각나요 ㅠㅠ' },
    'R5-A': { chain: [
      '요즘 썸남 답장 늦으면 ISTP 글부터 뒤졌어요ㅠㅠ 친구 게임엔 바로 접속한다는 대목에서 뜨끔. 운명원 사주엔 내 연애 습관도 나온다고들 하던데, 난 왜 이럴까? 이번 주는 검색 대신 내 마음부터 적어볼래요.',
      '처음엔 사진 확대 비유가 좀 뻔하다 싶었는데 크크크 안 붙인 것까지 눈에 띈다는 말에 설득됐어요ㅋㅋ 나도 딱 그랬네. 운명원에서 둘 궁합 보면 이 사람이랑 나 어떤 사이인지 나온다길래 그게 궁금해지네요',
      '충동만 참은 건 공백이고 뭘 잘못했는지 안 게 변화라는 말, 나는 아직 공백이려나? 운명원에서 다시 연락할 때가 언제인지도 본다대서 솔깃하네요. 너한테 갈 날 오면 그땐 급하지 않게 갈게.',
      '"친구도 3시간 안 읽는데 왜 남자만 서운하냐"는 말에 할 말이 없었어요ㅋㅋ 내가 딱 그랬음. 운명원은 앞으로 올 인연 흐름도 짚어 준다던데, 나만 계속 이러면 어쩌죠?',
      '요즘 내가 그 사람 말투까지 좋게 해석해 주고 있었네요ㅠㅠ 통역에 자막까지 달아 준다는 말에 뜨끔. 운명원에선 그 사람 속마음도 나온다며, 진짜 날 어떻게 생각하는지부터 알고 싶다. 이제 내 몫만 할 거야.'],
      regen: 'ㅋㅋ 예고편만 보고 끝났다는 말에 무릎 쳤어요. 내가 본편을 혼자 찍고 있었네. 운명원 얘기 들으니 내 연애 패턴 같은 것도 나온다던데, 나는 왜 맨날 먼저 달려갈까ㅠㅠ' },
  }
  const SHAPE = /^이번 댓글 짜임: (.+?)\. 브랜드 문장은 후반에 (.+?) 꼴로 씁니다\. 궁금증의 방향: (.+?)\. (.+)\.$/
  const shape = (title: string, recentDrafts: string[]) => SHAPE.exec(buildUserPrompt({ ...ctx, video: { ...ctx.video, title }, recentDrafts })
    .split('\n').find((l) => l.startsWith('이번 댓글 짜임:'))!)!.slice(1)
  const O = { conf: '"요즘"이나 "나/저"로 시작하는 내 상황 고백', quote: '영상 속 말을 따옴표로 짧게 인용하며 시작', laugh: '웃음이나 감탄으로 시작',
    doubt: '"처음엔 ~했는데"로 반신반의하다 설득된 얘기를 한 문장에 담아 시작', q: '물음표로 끝나는 질문 한 문장으로 시작', scene: '영상 속 장면을 내 말로 짧게 다시 짚으며 시작' }
  const PLAIN = '내 상황을 담담하게 정리하는 말로 끝', INNER = '그 사람에게 "너"라고 부르며 속으로 하는 말로 끝'
  const LABELS: Record<string, string[]> = { 'R3-B': [O.conf, O.scene, O.conf, O.doubt, O.laugh], 'R4-B': [O.conf, O.laugh, O.scene, O.doubt, O.conf],
    'R5-A': [O.conf, O.doubt, O.q, O.quote, O.conf] }
  // 다시 생성한 영상(세 번째)의 원래 초안 X0 가 실제로 쓴 시작·끝
  const X0: Record<string, [string, string]> = { 'R3-B': [O.conf, PLAIN], 'R4-B': [O.scene, PLAIN], 'R5-A': [O.q, INNER] }
  const regenRecent = (chain: string[]) => [chain[2], ...[...chain].reverse().filter((t) => t !== chain[2])].slice(0, 5)   // 09 라우트 순서
  for (const [name, { chain }] of Object.entries(RUNS)) {
    it(`${name}: chained videos never get an opening an earlier draft already used`, () => {
      chain.forEach((_, k) => expect(LABELS[name].slice(0, k)).not.toContain(shape(TITLES[k], chain.slice(0, k).reverse())[0]))
    })
    it(`${name}: the regenerate avoids the opening and closing its own previous draft used`, () => {
      const r = shape(TITLES[2], regenRecent(chain))
      expect(r[0]).not.toBe(X0[name][0]); expect(r[3]).not.toBe(X0[name][1])
    })
    it(`${name}: catch-all opening and closing are not handed out once the channel has drafts`, () => {
      for (let k = 1; k < chain.length; k++) { const s = shape(TITLES[k], chain.slice(0, k).reverse()); expect(s[0]).not.toBe(O.scene); expect(s[3]).not.toBe(PLAIN) }
      const r = shape(TITLES[2], regenRecent(chain)); expect(r[0]).not.toBe(O.scene); expect(r[3]).not.toBe(PLAIN)
    })
  }
})
