import { mkdirSync } from 'node:fs'
import path from 'node:path'
// path.join 마다 붙은 turbopackIgnore 는 next build 가 data/ 를 파일 추적하지 않게 한다.
// 추적하면 Chrome 이 프로필에 남기는 끊어진 심볼릭 링크(RunningChromeVersion)에서 빌드가 실패한다.
export const dataDir = () => path.join(/* turbopackIgnore: true */ process.cwd(), 'data')
export const dbPath = () => path.join(/* turbopackIgnore: true */ dataDir(), 'agent.db')
export const profileDir = (index: number) => path.join(/* turbopackIgnore: true */ dataDir(), 'profiles', String(index))
export const screenshotDir = () => path.join(/* turbopackIgnore: true */ dataDir(), 'screenshots')
export const captionDir = () => path.join(/* turbopackIgnore: true */ dataDir(), 'captions')
export function ensureDataDirs(): void {
  for (const d of [dataDir(), screenshotDir(), captionDir(), path.join(/* turbopackIgnore: true */ dataDir(), 'profiles')]) mkdirSync(d, { recursive: true })
}
