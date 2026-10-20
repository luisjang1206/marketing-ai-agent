import { mkdirSync } from 'node:fs'
import path from 'node:path'
export const dataDir = () => path.join(process.cwd(), 'data')
export const dbPath = () => path.join(dataDir(), 'agent.db')
export const profileDir = (index: number) => path.join(dataDir(), 'profiles', String(index))
export const screenshotDir = () => path.join(dataDir(), 'screenshots')
export const captionDir = () => path.join(dataDir(), 'captions')
export function ensureDataDirs(): void {
  for (const d of [dataDir(), screenshotDir(), captionDir(), path.join(dataDir(), 'profiles')]) mkdirSync(d, { recursive: true })
}
