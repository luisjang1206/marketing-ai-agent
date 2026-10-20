# 07 크롬 프로필 (로그인 창 · 상태 확인)

Status: claimed
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
- [x] 1. `launch.ts`, `profiles.ts` 구현 (위 그대로). `checkLogin`은 `try/finally`로 반드시 `context.close()`.
- [x] 2. `scripts/try-login.ts` — 단독 실행 스크립트
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
- [x] 5. 커밋 `feat: add Chrome profile launcher with login check`

## 완료 기준
3개 프로필 모두 `checkLogin` → `loggedIn:true` + 채널명. `data/profiles/` 미추적 확인.

## Comments

1·2·5단계 완료 (2026-10-20, browser-engineer). `launch.ts`·`profiles.ts`는 이슈 인터페이스(이름·시그니처·런치 옵션·`PROFILE_SELECTORS` 값) 그대로이고, `checkLogin`·`openForLogin` 모두 `try/finally`로 `context.close()`한다. `pnpm add -D tsx`, `"try:login": "tsx scripts/try-login.ts"` 추가. 런치 옵션은 바꾸지 않았으므로 ADR-0002는 손대지 않았다.

이슈 코드와 다른 점 두 가지. (1) `scripts/try-login.ts`는 본문을 `async function main()`으로 감쌌다. 패키지가 CommonJS(`"type": "module"` 없음)라 tsx가 최상위 `await`를 "Top-level await is currently not supported with the "cjs" output format"으로 거부하기 때문이다. 경로·인자·동작은 동일하고, 실패 시 `process.exitCode = 1`. 이슈 08의 `scripts/try-post.ts`도 같은 이유로 `main()` 패턴을 써야 한다. (2) `openForLogin`은 context `'close'` 이벤트에 더해 "남은 페이지 0개"도 창 닫힘으로 본다. 임시 user-data-dir로 확인한 결과, macOS Chrome은 마지막 페이지를 닫아도 프로세스가 살아 있어 context `'close'`가 4초 동안 오지 않았다. `'close'`만 기다리면 사용자가 창을 닫아도 `try:login N login`이 끝나지 않는다. 로그인 중 뜨는 팝업 페이지도 `context.on('page')`로 추적한다. 이동 실패(네트워크 등)는 창을 그대로 두고 닫힘만 기다린다.

검증: `pnpm try:login 1 check`(빈 프로필) → `{ loggedIn: false, channelName: null }`, exit 0, 약 8.6초(아바타 5초 대기 포함), 끝난 뒤 프로필 1 Chrome 프로세스 없음. 임시 프로필 탐침에서 로그아웃 화면의 `PROFILE_SELECTORS.signIn` 1개 매치·표시, `avatar` 0개, `navigator.language` `ko-KR`, `navigator.webdriver` `false`. `git check-ignore -v data/profiles/1` → `.gitignore:28:data/`. `pnpm test` 94 passed / 1 skipped, `tsc --noEmit`·`pnpm lint` 클린. Playwright는 `pnpm test`에서 실행되지 않는다. 테스트는 추가하지 않았다: 순수 로직이 `name?.trim() || null` 한 줄뿐이라 테스트용 경계를 따로 만들 가치가 없고, 실제 경로는 `try:login`으로 수동 검증한다.

남은 일 (Status는 claimed 유지): 3·4단계. 사용자가 `pnpm try:login 1 login`·`2 login`·`3 login`으로 연 Chrome 창에서 유튜브1·2·3 계정에 직접 로그인하고 창을 닫은 뒤, `pnpm try:login N check`가 `loggedIn: true` + 채널명을 돌려주는지 확인해야 한다. 이때 `PROFILE_SELECTORS.accountName`(로그인 상태에서만 검증 가능)이 안 맞으면 그 값만 고친다.
