// 뜨기 직전 영상 판정. 순수 모듈: node:*, db, repo 를 import 하지 않는다 (spec §18.1, ADR-0005).
export type RisingRules = { minViews: number; maxViews: number; minViewsPerHour: number }
export type RisingAssessment = { hoursSincePublish: number; viewsPerHour: number; rising: boolean }

// 1분 미만은 1분으로 본다 (방금 올라온 영상의 0 나눗셈 방지).
const MIN_HOURS = 1 / 60

export function assessRising(v: { viewCount: number; publishedAt: string }, now: Date, rules: RisingRules): RisingAssessment {
  const hoursSincePublish = Math.max((now.getTime() - Date.parse(v.publishedAt)) / 3_600_000, MIN_HOURS)
  const viewsPerHour = v.viewCount / hoursSincePublish
  const rising = v.viewCount >= rules.minViews && v.viewCount <= rules.maxViews && viewsPerHour >= rules.minViewsPerHour
  return { hoursSincePublish, viewsPerHour, rising }
}

// search.list publishedAfter 용 RFC3339, 밀리초 없이.
export function publishedAfterIso(now: Date, withinHours: number): string {
  return new Date(now.getTime() - withinHours * 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z')
}
