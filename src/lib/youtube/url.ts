const ID = /^[A-Za-z0-9_-]{11}$/
export function parseVideoId(input: string): string | null {
  const s = input.trim()
  if (ID.test(s)) return s
  let u: URL
  try { u = new URL(s) } catch { return null }
  if (!/(^|\.)(youtube\.com|youtu\.be)$/.test(u.hostname)) return null
  const fromQuery = u.searchParams.get('v')
  const fromPath = u.hostname === 'youtu.be' ? u.pathname.slice(1).split('/')[0]
    : u.pathname.match(/^\/(?:shorts|live|embed)\/([^/?]+)/)?.[1] ?? null
  const cand = fromQuery ?? fromPath
  return cand && ID.test(cand) ? cand : null
}
