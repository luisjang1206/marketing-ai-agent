import { chromium, type BrowserContext } from 'playwright'

// ADR-0002: installed Chrome (not bundled Chromium) on an app-owned user-data-dir per Profile.
export async function launchProfile(userDataDir: string): Promise<BrowserContext> {
  return chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: false,
    viewport: null,
    locale: 'ko-KR',
    args: ['--lang=ko-KR', '--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
  })
}
