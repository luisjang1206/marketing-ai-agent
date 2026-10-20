import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'

const channelId = z.string().regex(/^UC[\w-]{22}$/, '채널 ID 형식이 아닙니다')
const ChannelSchema = z
  .union([channelId, z.object({ id: channelId, test: z.boolean().optional() })])
  .transform((c) => (typeof c === 'string' ? { id: c, test: false } : { id: c.id, test: c.test ?? false }))

export const AppConfigSchema = z.object({
  profiles: z.array(z.string().min(1)).min(1).max(3),
  channels: z.array(ChannelSchema).min(1),
  comment: z.object({
    min_chars: z.number().int().positive(),
    max_chars: z.number().int().positive(),
    brand: z.string().min(1),
    banned_phrases: z.array(z.string()).default([]),
    brand_phrases: z.array(z.string()).min(1),
  }),
  limits: z.object({ daily_max_comments: z.number().int().positive() }),
  fetch: z.object({ per_channel: z.number().int().min(1).max(50) }).default({ per_channel: 5 }),
  typing: z
    .object({ min_delay_ms: z.number().int().min(0), max_delay_ms: z.number().int().min(0) })
    .default({ min_delay_ms: 40, max_delay_ms: 110 }),
})
export type AppConfig = z.infer<typeof AppConfigSchema>
export type Channel = AppConfig['channels'][number]
export type Profile = { id: string; label: string; index: number }

export function parseConfig(yamlText: string): AppConfig {
  return AppConfigSchema.parse(parse(yamlText))
}
export function loadConfig(p = path.join(process.cwd(), 'config.yaml')): AppConfig {
  return parseConfig(readFileSync(p, 'utf8'))
}
export function profilesOf(cfg: AppConfig): Profile[] {
  return cfg.profiles.map((label, i) => ({ id: `p${i + 1}`, label, index: i + 1 }))
}
export function allowedChannelIds(cfg: AppConfig): string[] {
  return cfg.channels.map((c) => c.id)
}
export function testChannelIds(cfg: AppConfig): string[] {
  return cfg.channels.filter((c) => c.test).map((c) => c.id)
}
