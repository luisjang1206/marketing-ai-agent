import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const sdk = vi.hoisted(() => ({ ctor: vi.fn(), create: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: sdk.create }; constructor(opts: unknown) { sdk.ctor(opts) } },
}))

import { createAnthropicDraftLLM, envLocalBaseURL, DEFAULT_ANTHROPIC_BASE_URL } from '@/lib/draft/anthropic'

const draft = { concern: '썸남 연락 텀', evidence: '연락 텀이 길어지면', text: '초안' }
const toolUse = { content: [{ type: 'tool_use', id: 't1', name: 'submit_draft', input: draft }], stop_reason: 'tool_use' }

describe('createAnthropicDraftLLM', () => {
  beforeEach(() => { sdk.ctor.mockClear(); sdk.create.mockReset() })
  afterEach(() => { vi.unstubAllEnvs() })

  it('passes the official base URL when none is given, so a shell ANTHROPIC_BASE_URL cannot leak in', () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'http://shell-proxy.invalid')
    createAnthropicDraftLLM({ apiKey: 'k', model: 'm' })
    expect(sdk.ctor.mock.calls[0][0]).toMatchObject({ apiKey: 'k', baseURL: 'https://api.anthropic.com' })
    createAnthropicDraftLLM({ apiKey: 'k', model: 'm', baseURL: '' })
    expect(sdk.ctor.mock.calls[1][0]).toMatchObject({ baseURL: DEFAULT_ANTHROPIC_BASE_URL })
  })
  it('uses the caller base URL when given', () => {
    createAnthropicDraftLLM({ apiKey: 'k', model: 'm', baseURL: 'http://env-local.invalid' })
    expect(sdk.ctor.mock.calls[0][0]).toMatchObject({ baseURL: 'http://env-local.invalid' })
  })
  it('asks for submit_draft via a strict tool without forced tool_choice and returns its input', async () => {
    sdk.create.mockResolvedValue({ content: [{ type: 'thinking', thinking: '' }, ...toolUse.content], stop_reason: 'tool_use' })
    const out = await createAnthropicDraftLLM({ apiKey: 'k', model: 'claude-sonnet-5-5' })('SYS', 'USER')
    expect(out).toEqual(draft)
    const req = sdk.create.mock.calls[0][0]
    expect(req.model).toBe('claude-sonnet-5-5')
    expect(req.system).toContain('SYS'); expect(req.system).toContain('submit_draft')
    expect(req.messages).toEqual([{ role: 'user', content: 'USER' }])
    expect(req.tool_choice).toEqual({ type: 'auto' })
    expect(req.tools[0]).toMatchObject({ name: 'submit_draft', strict: true,
      input_schema: { additionalProperties: false, required: ['concern', 'evidence', 'text'] } })
  })
  it('throws with the stop reason when the model returns no complete tool call', async () => {
    const llm = createAnthropicDraftLLM({ apiKey: 'k', model: 'm' })
    sdk.create.mockResolvedValueOnce({ content: [{ type: 'text', text: '죄송합니다' }], stop_reason: 'refusal' })
    await expect(llm('s', 'u')).rejects.toThrow(/refusal/)
    sdk.create.mockResolvedValueOnce({ ...toolUse, stop_reason: 'max_tokens' })
    await expect(llm('s', 'u')).rejects.toThrow(/max_tokens/)
  })
})

describe('envLocalBaseURL', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'envlocal-'))
  afterEach(() => { vi.unstubAllEnvs() })
  afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

  it('reads ANTHROPIC_BASE_URL from the env file only, ignoring the shell', () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'http://shell-proxy.invalid')
    const f = path.join(dir, 'with.env'); writeFileSync(f, 'ANTHROPIC_API_KEY=\nANTHROPIC_BASE_URL=http://env-local.invalid\n')
    expect(envLocalBaseURL(f)).toBe('http://env-local.invalid')
  })
  it('falls back to the official URL when the file or the key is missing', () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'http://shell-proxy.invalid')
    const f = path.join(dir, 'without.env'); writeFileSync(f, 'ANTHROPIC_API_KEY=\n')
    expect(envLocalBaseURL(f)).toBe('https://api.anthropic.com')
    expect(envLocalBaseURL(path.join(dir, 'nope.env'))).toBe('https://api.anthropic.com')
  })
})
