import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parseVideoId } from './url'

export type CaptionResult = { text: string; source: 'subtitle' | 'none' }
export type ExecFn = (cmd: string, args: string[]) => Promise<{ code: number; stderr: string }>

export function parseVtt(vtt: string): string {
  const lines: string[] = []
  let inHeader = /^\uFEFF?WEBVTT/.test(vtt)
  for (const raw of vtt.split(/\r?\n/)) {
    if (inHeader) { if (!raw.trim()) inHeader = false; continue }
    const line = raw.replace(/<[^>]+>/g, '').trim()
    if (!line || /-->/.test(line) || /^\d+$/.test(line)) continue
    if (lines[lines.length - 1] !== line) lines.push(line)
  }
  return lines.join(' ')
}

const defaultExec: ExecFn = (cmd, args) => new Promise((resolve, reject) =>
  execFile(cmd, args, { timeout: 60_000 }, (err, _out, stderr) => {
    if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') return reject(err)
    resolve({ code: err ? 1 : 0, stderr: String(stderr) })
  }))

export async function fetchCaptions(videoId: string, { outDir, maxChars = 6000, exec = defaultExec }: { outDir: string; maxChars?: number; exec?: ExecFn }): Promise<CaptionResult> {
  if (parseVideoId(videoId) !== videoId) return { text: '', source: 'none' }
  const file = path.join(outDir, `${videoId}.ko.vtt`)
  if (!existsSync(file)) {
    try {
      const r = await exec('yt-dlp', ['--skip-download', '--write-sub', '--write-auto-sub', '--sub-lang', 'ko', '--sub-format', 'vtt', '--no-warnings',
        '-o', path.join(outDir, '%(id)s'), `https://www.youtube.com/watch?v=${videoId}`])
      if (r.code !== 0) console.warn(`yt-dlp exited ${r.code} for ${videoId}: ${r.stderr.trim()}`)
    } catch { return { text: '', source: 'none' } }
  }
  if (!existsSync(file)) return { text: '', source: 'none' }
  const text = parseVtt(readFileSync(file, 'utf8'))
  return text ? { text: [...text].slice(0, maxChars).join(''), source: 'subtitle' } : { text: '', source: 'none' }
}
