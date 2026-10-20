import { loadConfig } from './config'
import { getDb } from './db'
import { createYoutubeApi } from './youtube/api'
import { createAnthropicDraftLLM, envLocalBaseURL } from './draft/anthropic'
declare global { var __services: ReturnType<typeof build> | undefined }
function build() {
  const cfg = loadConfig()
  const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`${k} 가 .env.local 에 없습니다`); return v }
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5'
  return {
    cfg, db: getDb(),
    youtube: createYoutubeApi(need('YOUTUBE_API_KEY')),
    llm: createAnthropicDraftLLM({ apiKey: need('ANTHROPIC_API_KEY'), model, baseURL: envLocalBaseURL() }),   // .env.local 만 읽음. 셸 ANTHROPIC_BASE_URL 프록시 차단
    model,   // drafts.model 에 기록한다
    today: () => new Date().toLocaleDateString('sv-SE'),   // YYYY-MM-DD 로컬
  }
}
export const services = () => (globalThis.__services ??= build())
