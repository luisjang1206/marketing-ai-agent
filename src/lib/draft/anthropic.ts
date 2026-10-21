import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'
import type { DraftLLM, DraftOutput } from './generate'

// SDK는 baseURL 이 비어 있으면 셸의 ANTHROPIC_BASE_URL(프록시)을 읽는다. 항상 명시해서 막는다.
export const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com'

// Next 는 셸에 이미 있는 변수를 .env.local 값으로 덮지 않으므로 process.env 로는 둘을 구분할 수 없다.
// .env.local 파일만 읽어 ANTHROPIC_BASE_URL 을 찾고, 없으면 공식 주소.
// turbopackIgnore: 경로 인자를 next build 가 프로젝트 전체 추적으로 보지 않게 한다 (paths.ts 참고).
export function envLocalBaseURL(file = path.join(process.cwd(), '.env.local')): string {
  try { return parseEnv(readFileSync(/* turbopackIgnore: true */ file, 'utf8')).ANTHROPIC_BASE_URL || DEFAULT_ANTHROPIC_BASE_URL } catch { return DEFAULT_ANTHROPIC_BASE_URL }
}

const SUBMIT_DRAFT = {
  name: 'submit_draft', description: '댓글 초안 제출', strict: true,
  input_schema: {
    type: 'object' as const, additionalProperties: false, required: ['concern', 'evidence', 'text'],
    properties: {
      concern: { type: 'string', description: '영상이 다루는 연애 고민 한 문장' },
      evidence: { type: 'string', description: '댓글이 짚은 영상 속 구체 장면·말 (원문 인용 또는 묘사)' },
      text: { type: 'string', description: '댓글 초안' },
    },
  },
}

// claude-sonnet-5-5 는 tool_choice {type:'tool'} 을 400 으로 거절한다. auto + strict 도구 + 지시로 제출을 유도한다.
export function createAnthropicDraftLLM({ apiKey, model, baseURL }: { apiKey: string; model: string; baseURL?: string }): DraftLLM {
  const client = new Anthropic({ apiKey, authToken: null, baseURL: baseURL || DEFAULT_ANTHROPIC_BASE_URL })
  return async (system, user) => {
    const res = await client.messages.create({
      model, max_tokens: 16000, output_config: { effort: 'medium' },
      system: `${system}\n\n결과는 submit_draft 도구를 한 번 호출해 제출합니다.`,
      tools: [SUBMIT_DRAFT], tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: user }],
    })
    // max_tokens 로 잘린 호출이나 거절(refusal)은 도구 입력이 온전하지 않으므로 받지 않는다.
    const block = res.content.find((b) => b.type === 'tool_use')
    if (res.stop_reason !== 'tool_use' || !block || block.type !== 'tool_use') throw new Error(`모델이 초안을 반환하지 않았습니다 (stop_reason: ${res.stop_reason})`)
    return block.input as DraftOutput
  }
}
