// pnpm try:login <n> login|check
// The package is CommonJS (no "type": "module"), so tsx rejects top-level await; run inside main().
import { profileDir, ensureDataDirs } from '../src/lib/paths'
import { openForLogin, checkLogin } from '../src/lib/browser/profiles'

async function main(): Promise<void> {
  const n = Number(process.argv[2] ?? 1)
  const mode = process.argv[3] ?? 'check'
  ensureDataDirs()
  if (mode === 'login') await openForLogin(profileDir(n))
  else console.log(await checkLogin(profileDir(n)))
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
