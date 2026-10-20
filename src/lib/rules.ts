export type RuleReason = 'not_allowed_channel' | 'already_posted' | 'daily_cap_reached'
export type RuleVerdict = { allowed: true } | { allowed: false; reason: RuleReason; message: string }
export type RuleInput = { videoChannelId: string; allowedChannelIds: string[]; alreadyPosted: boolean; successCountToday: number; dailyMax: number }

export const RULE_MESSAGES: Record<RuleReason, (i: RuleInput) => string> = {
  not_allowed_channel: () => '허용 채널의 영상이 아닙니다',
  already_posted: () => '이 영상에는 이미 댓글을 달았습니다',
  daily_cap_reached: (i) => `오늘 게시 상한(${i.dailyMax}개)에 도달했습니다`,
}

export function checkPostAllowed(i: RuleInput): RuleVerdict {
  const fail = (reason: RuleReason): RuleVerdict => ({ allowed: false, reason, message: RULE_MESSAGES[reason](i) })
  if (!i.allowedChannelIds.includes(i.videoChannelId)) return fail('not_allowed_channel')
  if (i.alreadyPosted) return fail('already_posted')
  if (i.successCountToday >= i.dailyMax) return fail('daily_cap_reached')
  return { allowed: true }
}
