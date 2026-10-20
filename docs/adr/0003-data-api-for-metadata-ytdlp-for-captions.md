---
status: accepted
date: 2026-10-20
---

# 영상 메타데이터는 YouTube Data API v3, 자막은 yt-dlp

영상 목록·채널 확인·조회수는 YouTube Data API v3(API 키, 무료 할당량 10,000/일)로 가져온다. 채널 RSS 피드는 키가 필요 없지만 조회수가 없고 임의 영상의 채널을 확인할 수 없어 직접 입력 링크 검증과 뜨기 직전 영상 찾기를 못 한다. 자막은 Data API `captions`가 영상 소유자 OAuth를 요구하므로 yt-dlp CLI로 자동 자막(ko)을 받고, 자막이 없으면 제목·설명·인기 댓글(Data API `commentThreads`)로 폴백한다. 자막 유무는 UI에 표시한다.

## Consequences

- 실행 환경에 yt-dlp 설치 필요(README에 안내). 설치가 없으면 자막 없이 폴백으로 동작해야 한다.
- API 키는 `.env.local`에만 두고 저장소에 올리지 않는다.
