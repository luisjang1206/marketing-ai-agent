import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export type CaptionResult = { text: string; source: 'subtitle' | 'none' }
export type ExecFn = (cmd: string, args: string[]) => Promise<{ code: number; stderr: string }>

export function parseVtt(vtt: string): string {
  const lines: string[] = []
  for (const raw of vtt.split(/\r?\n/)) {
    const line = raw.replace(/<[^>]+>/g, '').trim()
    if (!line || line === 'WEBVTT' || /^(Kind|Language):/.test(line) || /-->/.test(line) || /^\d+$/.test(line)) continue
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
  const file = path.join(outDir, `${videoId}.ko.vtt`)
  if (!existsSync(file)) {
    try {
      await exec('yt-dlp', ['--skip-download', '--write-sub', '--write-auto-sub', '--sub-lang', 'ko', '--sub-format', 'vtt', '--no-warnings',
        '-o', path.join(outDir, '%(id)s'), `https://www.youtube.com/watch?v=${videoId}`])
    } catch { return { text: '', source: 'none' } }
  }
  if (!existsSync(file)) return { text: '', source: 'none' }
  const text = parseVtt(readFileSync(file, 'utf8'))
  return text ? { text: [...text].slice(0, maxChars).join(''), source: 'subtitle' } : { text: '', source: 'none' }
}
