import { errors, type BrowserContext, type Page } from 'playwright'
import { launchProfile } from './launch'

// All YouTube DOM selectors for Profile login checks live here. On breakage edit only this object
// and log the changed selector + date in the issue's ## Comments.
export const PROFILE_SELECTORS = {
  avatar: 'button#avatar-btn',
  accountName: 'ytd-active-account-header-renderer #account-name',
  accountHandle: 'ytd-active-account-header-renderer #channel-handle',
  signIn: 'a[aria-label*="로그인"], ytd-button-renderer#sign-in-button',
}

const YOUTUBE_URL = 'https://www.youtube.com/'
const AVATAR_WAIT_MS = 5_000

export type LoginStatus = { loggedIn: boolean; channelName: string | null }

async function firstPage(context: BrowserContext): Promise<Page> {
  return context.pages()[0] ?? (await context.newPage())
}

// Resolves when the user closes the window. On macOS Chrome keeps running after its last window
// closes, so the context 'close' event alone may never fire; treat "no pages left" as closed too.
function untilWindowClosed(context: BrowserContext): Promise<void> {
  return new Promise((resolve) => {
    context.once('close', () => resolve())
    const onPageClose = () => {
      if (context.pages().length === 0) resolve()
    }
    for (const page of context.pages()) page.once('close', onPageClose)
    context.on('page', (page) => page.once('close', onPageClose))
  })
}

// Opens youtube.com for a human to log in, and resolves after they close the window.
// Callers do not await this (the dashboard returns immediately).
export async function openForLogin(userDataDir: string): Promise<void> {
  const context = await launchProfile(userDataDir)
  try {
    const closed = untilWindowClosed(context)
    const page = await firstPage(context)
    // A failed or interrupted navigation leaves the window open for the user; only the close matters.
    await page.goto(YOUTUBE_URL).catch(() => undefined)
    await closed
  } finally {
    await context.close()
  }
}

export async function checkLogin(userDataDir: string): Promise<LoginStatus> {
  const context = await launchProfile(userDataDir)
  try {
    const page = await firstPage(context)
    await page.goto(YOUTUBE_URL)
    const avatar = page.locator(PROFILE_SELECTORS.avatar).first()
    // Only "no avatar within the wait" means logged out; a crashed or closed page must surface as an error.
    const loggedIn = await avatar.waitFor({ state: 'visible', timeout: AVATAR_WAIT_MS }).then(
      () => true,
      (err: unknown) => {
        if (err instanceof errors.TimeoutError) return false
        throw err
      },
    )
    if (!loggedIn) return { loggedIn: false, channelName: null }

    await avatar.click()
    const read = (selector: string) =>
      page.locator(selector).first().innerText({ timeout: AVATAR_WAIT_MS }).then((t) => t.trim() || null, () => null)
    // Comments show their author as the @handle (not the display name), and the poster matches on channelName,
    // so prefer the handle; the display name is only a fallback.
    const channelName = (await read(PROFILE_SELECTORS.accountHandle)) ?? (await read(PROFILE_SELECTORS.accountName))
    return { loggedIn: true, channelName }
  } finally {
    await context.close()
  }
}
