# 07 크롬 프로필 (로그인 창 · 상태 확인)

Status: ready-for-agent
Type: task
Blocked by: 02
Agent: browser-engineer
Model: opus

## 목표
spec §10. 프로필별 `data/profiles/<n>`을 실제 Chrome으로 열어 사람이 로그인하게 하고, 로그인 여부와 채널명을 읽어 `profiles` 테이블에 저장한다. (ADR-0002)

## 파일
- Create: `src/lib/browser/launch.ts`, `src/lib/browser/profiles.ts`, `scripts/try-login.ts`

## 인터페이스
```ts
// launch.ts
import type { BrowserContext } from 'playwright'
export async function launchProfile(userDataDir: string): Promise<BrowserContext>
// = chromium.launchPersistentContext(userDataDir, { channel: 'chrome', headless: false, viewport: null, locale: 'ko-KR',
//     args: ['--lang=ko-KR', '--disable-blink-features=AutomationControlled'], ignoreDefaultArgs: ['--enable-automation'] })

// profiles.ts
export async function openForLogin(userDataDir: string): Promise<void>
//   youtube.com 열고 사용자가 창을 닫을 때까지 대기(context 'close' 이벤트). 호출자는 await 하지 않는다.
export type LoginStatus = { loggedIn: boolean; channelName: string | null }
export async function checkLogin(userDataDir: string): Promise<LoginStatus>
//   youtube.com 열기 → `#avatar-btn` 5초 대기. 있으면 클릭 → `ytd-active-account-header-renderer #account-name` 텍스트. 없으면 loggedIn:false. 항상 close.
export const PROFILE_SELECTORS = { avatar: 'button#avatar-btn', accountName: 'ytd-active-account-header-renderer #account-name', signIn: 'a[aria-label*="로그인"], ytd-button-renderer#sign-in-button' }
```

## 단계
- [ ] 1. `launch.ts`, `profiles.ts` 구현 (위 그대로). `checkLogin`은 `try/finally`로 반드시 `context.close()`.
- [ ] 2. `scripts/try-login.ts` — 단독 실행 스크립트
```ts
import { profileDir, ensureDataDirs } from '../src/lib/paths'
import { openForLogin, checkLogin } from '../src/lib/browser/profiles'
const n = Number(process.argv[2] ?? 1); const mode = process.argv[3] ?? 'check'
ensureDataDirs()
if (mode === 'login') await openForLogin(profileDir(n))
else console.log(await checkLogin(profileDir(n)))
```
`package.json`: `"try:login": "tsx scripts/try-login.ts"` (`pnpm add -D tsx`).
- [ ] 3. 수동 검증: `pnpm try:login 1 login` → Chrome 창 → 유튜브1 계정 로그인 → 창 닫기. `pnpm try:login 1 check` → `{ loggedIn: true, channelName: '...' }`. 셀렉터가 안 맞으면 `PROFILE_SELECTORS`만 고친다.
- [ ] 4. 프로필 2, 3도 같은 절차. 구글이 "안전하지 않은 브라우저" 경고를 내면 `ignoreDefaultArgs`/`args` 조합을 조정하고 결과를 ADR-0002 Consequences에 한 줄 추가.
- [ ] 5. 커밋 `feat: add Chrome profile launcher with login check`

## 완료 기준
3개 프로필 모두 `checkLogin` → `loggedIn:true` + 채널명. `data/profiles/` 미추적 확인.
