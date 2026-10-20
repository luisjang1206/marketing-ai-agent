// pnpm try:post <profileIndex> <videoId> "<text>"                 실제 게시
// pnpm try:post <profileIndex> <videoId> --verify-only "<text>"   읽기 전용: 이미 달린 내 댓글을 찾아 하이라이트·캡처만 한다
// Test Channel videos only (AGENTS.md Immutable Constraint 1): the script looks up the video's channel with the
// Data API and refuses to run unless it is the `test: true` channel in config.yaml.
// The package is CommonJS (no "type": "module"), so tsx rejects top-level await; run inside main().
import path from 'node:path'
import { loadConfig, testChannelIds } from '../src/lib/config'
import { profileDir, screenshotDir, ensureDataDirs } from '../src/lib/paths'
import { createYoutubeApi } from '../src/lib/youtube/api'
import { checkLogin } from '../src/lib/browser/profiles'
import { postComment, verifyComment } from '../src/lib/browser/poster'

const USAGE = '사용법: pnpm try:post <profileIndex> <videoId> [--verify-only] "<text>"'
const VERIFY_FLAG = '--verify-only'
const stamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false })

function refuse(message: string): void {
  console.error(message)
  process.exitCode = 1
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const verifyOnly = args.includes(VERIFY_FLAG)
  // Any other `--flag` is refused in every position, and the comment text may not start with `-` at all, so a flag typo
  // (`--verify`, `-v`) can never end up posted as the comment text. Video IDs may legitimately start with `-`.
  const positional = args.filter((a) => a !== VERIFY_FLAG)
  if (positional.some((a) => a.startsWith('--')) || positional.length !== 3) return refuse(USAGE)
  const [n, videoId, text] = positional
  if (!/^\d+$/.test(n) || !videoId || !text || text.startsWith('-')) return refuse(USAGE)
  const cfg = loadConfig()

  // 테스트 채널 확인. 키나 영상 정보가 없으면 실행하지 않는다.
  try { process.loadEnvFile('.env.local') } catch { /* 파일이 없으면 아래 키 확인에서 멈춘다 */ }
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return refuse('YOUTUBE_API_KEY가 없어 영상의 채널을 확인할 수 없습니다. 실행하지 않습니다.')
  const video = await createYoutubeApi(apiKey).getVideo(videoId)
  if (!video) return refuse(`영상을 찾을 수 없습니다: ${videoId}`)
  if (!testChannelIds(cfg).includes(video.channelId)) {
    return refuse(`테스트 채널 영상이 아닙니다(채널 ${video.channelId}). 실행하지 않습니다.`)
  }
  console.log(`영상: ${video.title} / 채널: ${video.channelTitle} (테스트 채널 확인됨)${verifyOnly ? ' [확인 전용, 게시 안 함]' : ''}`)

  ensureDataDirs()
  const userDataDir = profileDir(Number(n))
  // 러너와 같은 조건으로 확인하려고, 대시보드가 profiles.channel_name에 저장하는 값(checkLogin)을 expectedAuthor로 쓴다.
  const login = await checkLogin(userDataDir)
  console.log(`[${stamp()}] 프로필 ${n} 로그인 확인:`, login)

  if (verifyOnly) {
    // 읽기 전용 경로: verifyComment 에는 입력창 클릭·타이핑·등록 코드가 없다.
    const screenshotPath = path.join(screenshotDir(), `try-verify-${Date.now()}.png`)
    const started = Date.now()
    const result = await verifyComment({ userDataDir, videoId, text, expectedAuthor: login.channelName, screenshotPath })
    console.log(`[${stamp()}] verify-only ${((Date.now() - started) / 1000).toFixed(1)}s`, result)
    if (!result.ok) process.exitCode = 1
    return
  }

  const screenshotPath = path.join(screenshotDir(), `try-${Date.now()}.png`)
  const result = await postComment({
    userDataDir,
    videoId,
    text,
    expectedAuthor: login.channelName,
    typingDelayMs: [cfg.typing.min_delay_ms, cfg.typing.max_delay_ms],
    screenshotPath,
    onProgress: (p) => console.log(`[${stamp()}] ${p}`),
  })
  console.log(result)
  if (!result.ok) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
