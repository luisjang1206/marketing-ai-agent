---
status: accepted
date: 2026-10-20
---

# 게시는 앱 전용 user-data-dir의 실제 Chrome을 Playwright persistent context로 연다

크롬은 평소 쓰는 기본 프로필의 자동 제어를 막는다(과제 문서 명시). 그래서 프로필(유튜브1~3)마다 앱 전용 `user-data-dir`를 두고 `launchPersistentContext(dir, { channel: 'chrome', headless: false })`로 연다. 번들 Chromium 대신 설치된 Chrome 채널을 쓰는 이유는 구글 로그인 봇 탐지에 덜 걸리고 로그인 세션이 오래 유지되기 때문이다. 최초 1회 구글 로그인은 대시보드의 프로필 설정에서 창을 열어 사용자가 직접 한다.

## Considered Options

- 실행 중인 기본 Chrome에 CDP(`--remote-debugging-port`)로 붙기: 기본 프로필 제한으로 기각.
- 번들 Chromium headless: 시연 영상에 크롬 창이 열리는 장면이 필요하고, 구글 로그인이 자주 막힘.
